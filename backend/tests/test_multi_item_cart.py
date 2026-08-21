"""
Multi-item cart backend tests — Iteration 27
Validates POST /api/orders/create with `items` array (multi-item cart) +
backward compat + cross-vendor guard + reorder vendorId + surplus qty limit.
NOTE: Razorpay is LIVE — tests stop at pending_order / razorpay_order_id creation
      and DO NOT verify a real payment.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

# Vendors from test_credentials.md (both are status=active)
VENDOR_A = "vendor_e177d1bc3c50"  # Draft Test Kitchen (mon-sun 18:00-21:00)
VENDOR_B = "vendor_1ab4824b1e97"  # TEST Home Veg 1787310135 (mon-sun 00:01-23:59)


# ─── customer fixture ────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def customer_token():
    s = requests.Session()
    email = f"TEST_cart_{int(time.time())}@test.in"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "TestPass123!",
        "name": "TEST Cart User", "phone": "9876543210",
    })
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(customer_token):
    return {"Authorization": f"Bearer {customer_token}"}


# ─── vendor A menu (Draft Test Kitchen) ───────────────────────────────────
@pytest.fixture(scope="module")
def vendorA_menu():
    r = requests.get(f"{API}/restaurants/{VENDOR_A}")
    assert r.status_code == 200
    data = r.json()
    return {"vendor": data["vendor"], "menu_items": data["menu_items"], "surplus": data["surplus_items"]}


@pytest.fixture(scope="module")
def vendorB_menu():
    r = requests.get(f"{API}/restaurants/{VENDOR_B}")
    assert r.status_code == 200
    data = r.json()
    return {"vendor": data["vendor"], "menu_items": data["menu_items"], "surplus": data["surplus_items"]}


# ═══ tests ════════════════════════════════════════════════════════════════

class TestValidation:
    """Cart validation errors — no Razorpay call is made."""

    def test_empty_items_rejected(self, auth_headers):
        r = requests.post(f"{API}/orders/create", json={"items": [], "order_type": "takeaway"}, headers=auth_headers)
        assert r.status_code == 400
        assert "empty" in r.json().get("detail", "").lower()

    def test_missing_food_item_id_and_items_rejected(self, auth_headers):
        r = requests.post(f"{API}/orders/create", json={"order_type": "takeaway"}, headers=auth_headers)
        assert r.status_code == 400

    def test_zero_quantity_treated_as_empty(self, auth_headers, vendorA_menu):
        fid = vendorA_menu["menu_items"][0]["menu_item_id"]
        r = requests.post(f"{API}/orders/create", json={
            "items": [{"food_item_id": fid, "quantity": 0}], "order_type": "takeaway",
        }, headers=auth_headers)
        assert r.status_code == 400
        assert "empty" in r.json().get("detail", "").lower()

    def test_cross_vendor_items_rejected(self, auth_headers, vendorA_menu, vendorB_menu):
        fid_a = vendorA_menu["menu_items"][0]["menu_item_id"]
        fid_b = vendorB_menu["menu_items"][0]["menu_item_id"]
        r = requests.post(f"{API}/orders/create", json={
            "items": [
                {"food_item_id": fid_a, "quantity": 1},
                {"food_item_id": fid_b, "quantity": 1},
            ],
            "order_type": "takeaway",
        }, headers=auth_headers)
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        assert "same restaurant" in detail.lower(), f"unexpected detail: {detail}"

    def test_unknown_food_item_returns_404(self, auth_headers):
        r = requests.post(f"{API}/orders/create", json={
            "items": [{"food_item_id": "menu_does_not_exist", "quantity": 1}],
            "order_type": "takeaway",
        }, headers=auth_headers)
        assert r.status_code == 404

    def test_surplus_over_quantity_available_rejected(self, auth_headers, vendorB_menu):
        surplus = [s for s in vendorB_menu["surplus"] if s.get("quantity_available")]
        if not surplus:
            pytest.skip("No surplus item with quantity_available available in test vendor B")
        s0 = surplus[0]
        avail = s0["quantity_available"]
        r = requests.post(f"{API}/orders/create", json={
            "items": [{"food_item_id": s0["menu_item_id"], "quantity": avail + 5}],
            "order_type": "surplus",
        }, headers=auth_headers)
        assert r.status_code == 400
        assert "only" in r.json().get("detail", "").lower() or "left" in r.json().get("detail", "").lower()

    def test_auth_required(self):
        r = requests.post(f"{API}/orders/create", json={"items": [{"food_item_id": "x", "quantity": 1}]})
        assert r.status_code in (401, 403)


class TestCreatePending:
    """Order creation up to Razorpay order_id — does NOT complete payment.

    Verifies:
    * items array is accepted
    * legacy single-item body still works
    * response contains razorpay_order_id / amount / key_id
    * pending_order stored has items array + summed total (via GST/fee math)
    """

    def _pricing(self, items):
        """subtotal + 5% GST + 5% fee — matches server settings defaults."""
        sub = sum(round(i["price"] * i["qty"], 2) for i in items)
        gst = round(sub * 0.05, 2)
        fee = round(sub * 0.05, 2)
        return sub, gst, fee, round(sub + gst + fee, 2)

    def test_multi_item_takeaway_creates_razorpay_order(self, auth_headers, vendorA_menu):
        # 2 different menu items from Draft Test Kitchen, takeaway
        items_src = vendorA_menu["menu_items"][:2]
        assert len(items_src) >= 2, "Draft Test Kitchen must have >= 2 menu items"
        body_items = [
            {"food_item_id": items_src[0]["menu_item_id"], "quantity": 2},
            {"food_item_id": items_src[1]["menu_item_id"], "quantity": 1},
        ]
        r = requests.post(f"{API}/orders/create", json={
            "items": body_items, "order_type": "takeaway",
        }, headers=auth_headers)
        # Vendor open 18:00-21:00 IST — if outside window, expect 400 with next-open text
        if r.status_code == 400:
            detail = r.json().get("detail", "").lower()
            if "closed" in detail or "not currently accepting" in detail:
                pytest.skip(f"Vendor closed at test time: {detail}")
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text}"
        data = r.json()
        assert "razorpay_order_id" in data and data["razorpay_order_id"].startswith("order_")
        assert "key_id" in data and data["key_id"]
        # verify amount matches subtotal * 1.10 (5% gst + 5% fee), rounded
        priced = [
            {"price": items_src[0]["price"], "qty": 2},
            {"price": items_src[1]["price"], "qty": 1},
        ]
        _sub, _gst, _fee, total = self._pricing(priced)
        expected_paise = int(round(total, 2) * 100)
        # allow +/-1 paise for rounding drift
        assert abs(data["amount"] - expected_paise) <= 1, f"amount {data['amount']} != expected ~{expected_paise}"

    def test_legacy_single_item_body_still_works(self, auth_headers, vendorA_menu):
        item = vendorA_menu["menu_items"][0]
        r = requests.post(f"{API}/orders/create", json={
            "food_item_id": item["menu_item_id"], "quantity": 1, "order_type": "takeaway",
        }, headers=auth_headers)
        if r.status_code == 400 and "closed" in r.json().get("detail", "").lower():
            pytest.skip("Vendor closed at test time")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("razorpay_order_id", "").startswith("order_")

    def test_multi_item_surplus_creates_order(self, auth_headers, vendorB_menu):
        surplus = [s for s in vendorB_menu["surplus"] if s.get("quantity_available", 0) >= 2]
        if not surplus:
            pytest.skip("No surplus item with qty>=2 available in vendor B")
        s0 = surplus[0]
        r = requests.post(f"{API}/orders/create", json={
            "items": [{"food_item_id": s0["menu_item_id"], "quantity": 2}],
            "order_type": "surplus",
        }, headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.json().get("razorpay_order_id", "").startswith("order_")


class TestPendingShape:
    """Verify pending_orders doc structure (items array + summed subtotal)."""

    def test_pending_has_items_array(self, auth_headers, vendorA_menu):
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient

        items_src = vendorA_menu["menu_items"][:2]
        body_items = [
            {"food_item_id": items_src[0]["menu_item_id"], "quantity": 1},
            {"food_item_id": items_src[1]["menu_item_id"], "quantity": 3},
        ]
        r = requests.post(f"{API}/orders/create", json={
            "items": body_items, "order_type": "takeaway",
        }, headers=auth_headers)
        if r.status_code == 400 and "closed" in r.json().get("detail", "").lower():
            pytest.skip("Vendor closed at test time")
        assert r.status_code == 200, r.text
        rzp_id = r.json()["razorpay_order_id"]

        async def _check():
            c = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
            db = c[os.environ.get("DB_NAME", "perfectly_good")]
            doc = await db.pending_orders.find_one({"razorpay_order_id": rzp_id}, {"_id": 0})
            return doc

        doc = asyncio.run(_check())
        assert doc, f"pending_orders doc missing for {rzp_id}"
        assert isinstance(doc.get("items"), list) and len(doc["items"]) == 2
        for pi in doc["items"]:
            assert "food_item_id" in pi and "quantity" in pi and "unit_price" in pi
            assert "line_subtotal" in pi and "food_item_name" in pi
        # summed quantity = 1 + 3 = 4
        assert doc.get("quantity") == 4
        # item_subtotal = sum(line_subtotals)
        expected_sub = round(sum(pi["line_subtotal"] for pi in doc["items"]), 2)
        assert abs(doc.get("item_subtotal", 0) - expected_sub) < 0.01
        # total = subtotal * 1.10
        expected_total = round(expected_sub * 1.10, 2)
        assert abs(doc.get("total_amount", 0) - expected_total) < 0.02


class TestReorderVendorId:
    """GET /api/orders/{id}/reorder must return vendorId (contract test).

    We check the endpoint's response shape without needing a real paid order:
    404 for unknown, and if the customer has a past order, vendorId key exists.
    """

    def test_reorder_unknown_id_404(self, auth_headers):
        r = requests.get(f"{API}/orders/order_unknown_xxxx/reorder", headers=auth_headers)
        assert r.status_code == 404

    def test_reorder_response_has_vendorId_key(self, auth_headers):
        # Fetch this user's orders; if none, skip. Otherwise verify vendorId is returned.
        r = requests.get(f"{API}/orders/user", headers=auth_headers)
        assert r.status_code == 200
        orders = r.json()
        if not orders:
            pytest.skip("Fresh test customer — no historical orders to reorder from")
        for o in orders:
            oid = o["order_id"]
            rr = requests.get(f"{API}/orders/{oid}/reorder", headers=auth_headers)
            if rr.status_code == 200:
                body = rr.json()
                assert "vendorId" in body, f"reorder response missing vendorId: keys={list(body.keys())}"
                assert body["vendorId"], "vendorId must not be empty"
                return
        pytest.skip("No historical order was reorderable (item/vendor no longer available)")


class TestClosedRestaurant:
    """A vendor closed at request time returns 400 with next-open text (not a bug)."""

    def test_response_shape_when_closed(self, auth_headers, vendorA_menu):
        # We can't force a vendor closed from a test, but we can assert the
        # 400 branch only trips for closed vendors — if open, we simply pass.
        item = vendorA_menu["menu_items"][0]
        r = requests.post(f"{API}/orders/create", json={
            "items": [{"food_item_id": item["menu_item_id"], "quantity": 1}],
            "order_type": "takeaway",
        }, headers=auth_headers)
        if r.status_code == 400:
            detail = r.json().get("detail", "")
            # Acceptable: closed with next-open text OR not-active
            assert (
                "closed" in detail.lower()
                or "not currently accepting" in detail.lower()
            ), f"Unexpected 400 detail: {detail}"
        else:
            assert r.status_code == 200
