"""Regression tests for Jan-2026 review:
- AI menu import endpoint removed
- Ops CSV/XLSX parse-file (veg/egg parsing)
- Ops PUT /api/ops/menu/{id} discounted_price
- Vendor menu list + toggle in_stock; customer visibility follows
- Vendor surplus drop <30% discount rejection
- Admin sidebar perms (7 items)
- Operations role RBAC: cannot create staff (POST /api/ops/staff => 403)
- All 5 seeded staff can log in
"""
import io
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN = ("anubhavg@perfectlygood.in", "Anubhavv")
OPS_ACCOUNTS = [
    ("chaitanya@perfectlygood.in", "123456789"),
    ("kavyashetty975@gmail.com", "123456789"),
    ("sas023261@gmail.com", "123456789"),
    ("subhashramachandraofficial@gmail.com", "123456789"),
]
VENDOR = ("vendor@demo.com", "vendor123")
VENDOR_ID = "dv_namma"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login {email} failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_tok():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def ops_tok():
    return _login(*OPS_ACCOUNTS[0])


@pytest.fixture(scope="module")
def vendor_tok():
    return _login(*VENDOR)


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# --- 1) Seeded staff logins ---
class TestSeededLogins:
    def test_admin_login(self):
        _login(*ADMIN)

    @pytest.mark.parametrize("email,pwd", OPS_ACCOUNTS)
    def test_ops_login(self, email, pwd):
        tok = _login(email, pwd)
        me = requests.get(f"{API}/auth/me", headers=H(tok), timeout=15)
        assert me.status_code == 200
        assert me.json().get("role") == "operations"


# --- 2) AI import removed ---
class TestAIImportRemoved:
    def test_extract_endpoint_404(self, admin_tok):
        # Try with a small blob
        files = {"file": ("t.jpg", b"\xff\xd8\xff\xd9", "image/jpeg")}
        r = requests.post(f"{API}/ops/menu-import/extract", files=files, headers=H(admin_tok), timeout=15)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"


# --- 3) parse-file veg/egg parsing ---
CSV_TEXT = (
    "Item,Description,Original Price,Veg/Non-Veg,Contains Egg\n"
    "Paneer Butter Masala,Rich creamy paneer,250,Veg,No\n"
    "Chicken Biryani,Spicy dum biryani,320,Non-Veg,No\n"
    "Egg Bhurji,Scrambled eggs masala,120,Veg,Yes\n"
    "Mutton Curry,Slow-cooked mutton,420,non veg,no\n"
)


class TestParseFile:
    def test_parse_csv_veg_egg(self, admin_tok):
        files = {"file": ("menu.csv", CSV_TEXT.encode("utf-8"), "text/csv")}
        r = requests.post(f"{API}/ops/menu-import/parse-file", files=files, headers=H(admin_tok), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        items = data["items"]
        assert data["count"] == 4
        by_name = {i["name"]: i for i in items}
        assert by_name["Paneer Butter Masala"]["food_type"] == "veg"
        assert by_name["Paneer Butter Masala"]["contains_egg"] is False
        assert by_name["Paneer Butter Masala"]["original_price"] == 250
        assert by_name["Chicken Biryani"]["food_type"] == "non_veg"
        assert by_name["Chicken Biryani"]["contains_egg"] is False
        assert by_name["Egg Bhurji"]["contains_egg"] is True
        assert by_name["Mutton Curry"]["food_type"] == "non_veg"

    def test_parse_requires_manage_menu(self, base_url=None):
        # Register an ephemeral customer (customer role has no manage_menu)
        import uuid
        email = f"test_perm_{uuid.uuid4().hex[:8]}@example.com"
        rr = requests.post(f"{API}/auth/register", json={
            "name": "TEST perm", "email": email, "password": "abc12345",
            "phone": "+911234567890", "role": "user"}, timeout=15)
        if rr.status_code not in (200, 201):
            pytest.skip(f"register failed: {rr.status_code} {rr.text[:200]}")
        tok = rr.json().get("access_token") or _login(email, "abc12345")
        files = {"file": ("menu.csv", CSV_TEXT.encode("utf-8"), "text/csv")}
        r = requests.post(f"{API}/ops/menu-import/parse-file", files=files, headers=H(tok), timeout=15)
        assert r.status_code == 403, f"customer should not have manage_menu, got {r.status_code}: {r.text[:200]}"


# --- 4) Ops can set discounted_price via PUT /api/ops/menu/{id} ---
class TestOpsSetDiscountedPrice:
    def test_bulk_add_then_set_discount(self, admin_tok):
        # bulk add 1 item to dv_namma
        payload = {"items": [{"name": "TEST_Regression_Item_" + str(int(time.time())),
                              "description": "for regression", "original_price": 200,
                              "food_type": "veg", "contains_egg": False}]}
        r = requests.post(f"{API}/ops/vendors/{VENDOR_ID}/menu/bulk", json=payload, headers=H(admin_tok), timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["created"] == 1
        # find it
        r = requests.get(f"{API}/ops/vendors/{VENDOR_ID}/menu", headers=H(admin_tok), timeout=15)
        assert r.status_code == 200
        item = [m for m in r.json() if m["name"] == payload["items"][0]["name"]][0]
        mid = item["menu_item_id"]
        # Update: Ops edits the item and adds the discounted price (full body – matches MenuItemForm)
        full_body = {
            "name": item["name"], "description": item.get("description", ""),
            "original_price": item["original_price"], "discounted_price": 139,
            "category": item.get("category", ""), "serving_size": item.get("serving_size", ""),
            "food_type": item.get("food_type", "veg"), "contains_egg": bool(item.get("contains_egg")),
            "available_today": bool(item.get("available_today", False)),
            "quantity_available": item.get("quantity_available"),
        }
        upd = requests.put(f"{API}/ops/menu/{mid}", json=full_body, headers=H(admin_tok), timeout=15)
        assert upd.status_code == 200, upd.text
        # Verify
        r2 = requests.get(f"{API}/ops/vendors/{VENDOR_ID}/menu", headers=H(admin_tok), timeout=15)
        it2 = [m for m in r2.json() if m["menu_item_id"] == mid][0]
        assert it2.get("discounted_price") == 139
        # Cleanup
        requests.delete(f"{API}/ops/menu/{mid}", headers=H(admin_tok), timeout=15)


# --- 5) Vendor menu toggle + customer visibility ---
class TestVendorMenuToggle:
    def test_toggle_affects_customer_visibility(self, vendor_tok):
        # get vendor menu
        r = requests.get(f"{API}/vendor/menu", headers=H(vendor_tok), timeout=15)
        assert r.status_code == 200, r.text
        menu = r.json()
        assert len(menu) > 0, "vendor menu should have items"
        target = next(m for m in menu if m.get("in_stock", True) is not False)
        mid = target["menu_item_id"]

        # get baseline customer count for dv_namma
        pub0 = requests.get(f"{API}/restaurants/{VENDOR_ID}", timeout=15)
        assert pub0.status_code == 200
        base_count = len(pub0.json().get("menu_items", []))
        assert base_count > 0

        # toggle OFF
        t = requests.put(f"{API}/vendor/menu/{mid}/toggle", json={"in_stock": False}, headers=H(vendor_tok), timeout=15)
        assert t.status_code == 200, t.text
        assert t.json()["in_stock"] is False

        pub1 = requests.get(f"{API}/restaurants/{VENDOR_ID}", timeout=15)
        assert pub1.status_code == 200
        off_count = len(pub1.json().get("menu_items", []))
        assert off_count == base_count - 1, f"off count {off_count} not baseline-1 ({base_count})"

        # toggle ON
        t2 = requests.put(f"{API}/vendor/menu/{mid}/toggle", json={"in_stock": True}, headers=H(vendor_tok), timeout=15)
        assert t2.status_code == 200
        pub2 = requests.get(f"{API}/restaurants/{VENDOR_ID}", timeout=15)
        on_count = len(pub2.json().get("menu_items", []))
        assert on_count == base_count, f"on count {on_count} != baseline {base_count}"


# --- 6) Vendor surplus <30% discount rejection ---
class TestVendorSurplusDiscount:
    def test_low_discount_rejected(self, vendor_tok):
        # find a menu item to base surplus on
        r = requests.get(f"{API}/vendor/menu", headers=H(vendor_tok), timeout=15)
        assert r.status_code == 200
        base = next((m for m in r.json() if m.get("original_price")), None)
        assert base
        body = {
            "menu_item_id": base["menu_item_id"],
            "discounted_price": int(float(base["original_price"]) * 0.9),  # only 10% off
            "quantity_available": 3,
            "pickup_start_time": "18:00",
            "pickup_end_time": "21:00",
        }
        rr = requests.post(f"{API}/vendor/drops", json=body, headers=H(vendor_tok), timeout=15)
        assert rr.status_code == 400, f"expected 400 for <30% discount, got {rr.status_code}: {rr.text[:200]}"


# --- 7) Admin perms include all 7 sidebar sections ---
class TestAdminSidebarPerms:
    REQUIRED = {"view_dashboard", "view_vendors", "view_orders", "view_users", "view_finance"}

    def test_admin_all_perms(self, admin_tok):
        me = requests.get(f"{API}/auth/me", headers=H(admin_tok), timeout=15)
        assert me.status_code == 200
        perms = set(me.json().get("permissions", []))
        missing = self.REQUIRED - perms
        assert not missing, f"admin missing perms: {missing}. all={perms}"
        # also manage_roles for Team Members section
        assert "manage_roles" in perms


# --- 8) Operations RBAC: cannot create staff ---
class TestOperationsRBAC:
    def test_ops_cannot_create_staff(self, ops_tok):
        body = {"name": "TEST_should_fail", "email": "test_forbidden@example.com",
                "password": "abc123456", "role": "operations"}
        r = requests.post(f"{API}/ops/staff", json=body, headers=H(ops_tok), timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"

    def test_ops_missing_manage_roles(self, ops_tok):
        me = requests.get(f"{API}/auth/me", headers=H(ops_tok), timeout=15)
        assert me.status_code == 200
        perms = set(me.json().get("permissions", []))
        assert "manage_roles" not in perms
