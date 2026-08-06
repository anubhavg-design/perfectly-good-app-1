"""
Sold-Out feature tests (Jan 2026).

Covers:
  1. Vendor toggle endpoint: PUT /api/vendor/menu/{item_id}/toggle (auth/RBAC + happy path)
  2. Customer feed /api/drops excludes sold-out surplus items
  3. Customer restaurant detail /api/restaurants/{vendor_id} excludes sold-out items
     from BOTH surplus_items and menu_items
  4. Order create blocks sold-out items with HTTP 400 for surplus AND takeaway
     (BEFORE Razorpay is called)
  5. Toggling back in_stock=True restores visibility + orderability

Test fixtures use:
  - Vendor: soldouttest@test.com / vendor123 (vendor_5a535d0e7dfb)
  - Items:
      Paneer Roll  = menu_38278f385303 (takeaway, available_today=false)
      Veg Momos    = menu_81837cef4ee5 (surplus,  available_today=true)
  - A freshly-registered customer for order-create attempts.

Leaves both items at in_stock=True at the end (best-effort cleanup).
"""

import os
import time
import uuid
import pytest
import requests


BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not set")

VENDOR_EMAIL = "soldouttest@test.com"
VENDOR_PASSWORD = "vendor123"
VENDOR_ID = "vendor_5a535d0e7dfb"
ITEM_TAKEAWAY = "menu_38278f385303"   # Paneer Roll (available_today=false)
ITEM_SURPLUS = "menu_81837cef4ee5"    # Veg Momos  (available_today=true)
ADMIN_EMAIL = "anubhavg@perfectlygood.in"
ADMIN_PASSWORD = "Anubhavv"


# ────────────────────────── helpers ──────────────────────────
def _login(email: str, password: str):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    return r


def _register_customer():
    email = f"TEST_soldout_{uuid.uuid4().hex[:8]}@test.com"
    payload = {
        "email": email,
        "password": "customer123",
        "name": "TEST SoldOut Customer",
        "phone": f"9{int(time.time()) % 1000000000:09d}",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=20)
    return r, email


def _auth_headers(token: str):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _toggle(token: str, item_id: str, in_stock: bool):
    return requests.put(
        f"{BASE_URL}/api/vendor/menu/{item_id}/toggle",
        json={"in_stock": in_stock},
        headers=_auth_headers(token),
        timeout=20,
    )


# ────────────────────────── fixtures ──────────────────────────
@pytest.fixture(scope="module")
def vendor_token():
    r = _login(VENDOR_EMAIL, VENDOR_PASSWORD)
    if r.status_code != 200:
        pytest.skip(f"Vendor login failed ({r.status_code}): {r.text[:200]}")
    return r.json().get("access_token")


@pytest.fixture(scope="module")
def customer_token():
    r, _ = _register_customer()
    if r.status_code not in (200, 201):
        pytest.skip(f"Customer register failed ({r.status_code}): {r.text[:200]}")
    data = r.json()
    return data.get("access_token") or data.get("token")


@pytest.fixture(autouse=True)
def _restore_stock_after_test(vendor_token):
    """Best-effort: put both test items back to in_stock=True after every test."""
    yield
    for iid in (ITEM_SURPLUS, ITEM_TAKEAWAY):
        try:
            _toggle(vendor_token, iid, True)
        except Exception:
            pass


# ─────────────────────── 1. toggle endpoint ───────────────────────
class TestToggleEndpoint:
    def test_toggle_requires_auth(self):
        r = requests.put(
            f"{BASE_URL}/api/vendor/menu/{ITEM_SURPLUS}/toggle",
            json={"in_stock": False},
            timeout=20,
        )
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}: {r.text[:200]}"

    def test_toggle_customer_forbidden(self, customer_token):
        r = requests.put(
            f"{BASE_URL}/api/vendor/menu/{ITEM_SURPLUS}/toggle",
            json={"in_stock": False},
            headers=_auth_headers(customer_token),
            timeout=20,
        )
        assert r.status_code == 403, f"Expected 403 for customer, got {r.status_code}: {r.text[:200]}"

    def test_toggle_sold_out_and_back(self, vendor_token):
        # Mark sold out
        r = _toggle(vendor_token, ITEM_SURPLUS, False)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
        body = r.json()
        assert body.get("in_stock") is False
        # Mark available
        r2 = _toggle(vendor_token, ITEM_SURPLUS, True)
        assert r2.status_code == 200, f"{r2.status_code}: {r2.text[:200]}"
        assert r2.json().get("in_stock") is True

    def test_toggle_unknown_item_404(self, vendor_token):
        r = _toggle(vendor_token, "menu_does_not_exist_xyz", False)
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text[:200]}"


# ─────────────────────── 2. /drops visibility ───────────────────────
class TestDropsVisibility:
    def _veg_momos_in_drops(self):
        r = requests.get(f"{BASE_URL}/api/drops", timeout=20)
        assert r.status_code == 200, r.text[:200]
        return any(
            (d.get("item_id") == ITEM_SURPLUS) or (d.get("menu_item_id") == ITEM_SURPLUS)
            for d in r.json()
        )

    def test_visible_when_in_stock(self, vendor_token):
        assert _toggle(vendor_token, ITEM_SURPLUS, True).status_code == 200
        assert self._veg_momos_in_drops(), "Veg Momos should be visible in /api/drops when in_stock=True"

    def test_hidden_when_sold_out(self, vendor_token):
        assert _toggle(vendor_token, ITEM_SURPLUS, False).status_code == 200
        assert not self._veg_momos_in_drops(), "Veg Momos should be HIDDEN in /api/drops when in_stock=False"


# ─────────────────────── 3. restaurant detail visibility ───────────────────────
class TestRestaurantDetailVisibility:
    def _fetch(self):
        r = requests.get(f"{BASE_URL}/api/restaurants/{VENDOR_ID}", timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
        return r.json()

    @staticmethod
    def _has(items, iid):
        return any(i.get("menu_item_id") == iid or i.get("item_id") == iid for i in items)

    def test_visible_when_in_stock(self, vendor_token):
        _toggle(vendor_token, ITEM_SURPLUS, True)
        _toggle(vendor_token, ITEM_TAKEAWAY, True)
        data = self._fetch()
        assert self._has(data.get("surplus_items", []), ITEM_SURPLUS)
        assert self._has(data.get("menu_items", []), ITEM_SURPLUS)
        assert self._has(data.get("menu_items", []), ITEM_TAKEAWAY)

    def test_surplus_item_hidden_from_both_lists_when_sold_out(self, vendor_token):
        assert _toggle(vendor_token, ITEM_SURPLUS, False).status_code == 200
        data = self._fetch()
        assert not self._has(data.get("surplus_items", []), ITEM_SURPLUS), "Sold-out Veg Momos still in surplus_items"
        assert not self._has(data.get("menu_items", []), ITEM_SURPLUS), "Sold-out Veg Momos still in menu_items"

    def test_takeaway_item_hidden_from_menu_when_sold_out(self, vendor_token):
        assert _toggle(vendor_token, ITEM_TAKEAWAY, False).status_code == 200
        data = self._fetch()
        assert not self._has(data.get("menu_items", []), ITEM_TAKEAWAY), "Sold-out Paneer Roll still in menu_items"


# ─────────────────────── 4. order-create blocking ───────────────────────
class TestOrderCreateBlocking:
    def _create(self, token, item_id, order_type):
        return requests.post(
            f"{BASE_URL}/api/orders/create",
            json={"food_item_id": item_id, "quantity": 1, "order_type": order_type},
            headers=_auth_headers(token),
            timeout=25,
        )

    def test_surplus_sold_out_returns_400(self, vendor_token, customer_token):
        assert _toggle(vendor_token, ITEM_SURPLUS, False).status_code == 200
        r = self._create(customer_token, ITEM_SURPLUS, "surplus")
        assert r.status_code == 400, f"Expected 400 for sold-out surplus, got {r.status_code}: {r.text[:300]}"
        detail = (r.json() or {}).get("detail", "")
        assert "sold out" in detail.lower(), f"Detail was: {detail!r}"

    def test_takeaway_sold_out_returns_400(self, vendor_token, customer_token):
        assert _toggle(vendor_token, ITEM_TAKEAWAY, False).status_code == 200
        r = self._create(customer_token, ITEM_TAKEAWAY, "takeaway")
        assert r.status_code == 400, f"Expected 400 for sold-out takeaway, got {r.status_code}: {r.text[:300]}"
        detail = (r.json() or {}).get("detail", "")
        assert "sold out" in detail.lower(), f"Detail was: {detail!r}"

    def test_available_item_does_not_return_sold_out_400(self, vendor_token, customer_token):
        # Ensure available
        assert _toggle(vendor_token, ITEM_SURPLUS, True).status_code == 200
        r = self._create(customer_token, ITEM_SURPLUS, "surplus")
        # The create may still succeed (200) or fail for other reasons (e.g. Razorpay 503),
        # but it must NOT return the sold-out 400.
        if r.status_code == 400:
            detail = (r.json() or {}).get("detail", "")
            assert "sold out" not in detail.lower(), (
                f"Available item should not be blocked as sold out. Detail: {detail!r}"
            )
        # Any other status code (200/503/etc) confirms sold-out block was skipped.


# ─────────────────────── 5. restoration flow ───────────────────────
class TestRestoration:
    def test_toggle_back_restores_visibility_and_orderability(self, vendor_token, customer_token):
        # sold out
        assert _toggle(vendor_token, ITEM_SURPLUS, False).status_code == 200
        r = requests.get(f"{BASE_URL}/api/drops", timeout=20)
        assert r.status_code == 200
        assert not any(d.get("item_id") == ITEM_SURPLUS for d in r.json())

        # restore
        assert _toggle(vendor_token, ITEM_SURPLUS, True).status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/drops", timeout=20)
        assert r2.status_code == 200
        assert any(d.get("item_id") == ITEM_SURPLUS for d in r2.json()), "Restored item missing from /drops"

        # restaurant detail
        r3 = requests.get(f"{BASE_URL}/api/restaurants/{VENDOR_ID}", timeout=20)
        assert r3.status_code == 200
        data = r3.json()
        assert any(i.get("menu_item_id") == ITEM_SURPLUS for i in data.get("surplus_items", []))

        # order create must not return sold-out 400 anymore
        r4 = requests.post(
            f"{BASE_URL}/api/orders/create",
            json={"food_item_id": ITEM_SURPLUS, "quantity": 1, "order_type": "surplus"},
            headers=_auth_headers(customer_token),
            timeout=25,
        )
        if r4.status_code == 400:
            detail = (r4.json() or {}).get("detail", "")
            assert "sold out" not in detail.lower(), f"Restored item still blocked: {detail!r}"
