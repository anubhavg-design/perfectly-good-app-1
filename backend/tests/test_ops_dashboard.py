"""Comprehensive OPS Dashboard backend tests.

Covers:
- AUTH / RBAC for staff roles (admin / operations / finance / customer_success)
- /api/ops/dashboard/stats
- /api/ops/vendors CRUD + notes + status
- /api/ops/menu management & availability -> /api/drops reflection
- /api/ops/orders, /api/ops/users, /api/ops/payouts, /api/ops/settings
- /api/ops/roles, /api/ops/staff, /api/ops/search
- Mobile regression: /api/drops, /api/drops/{id}, /api/orders/create+verify
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

STAFF = {
    "admin": ("admin@perfectlygood.com", "admin123"),
    "operations": ("operations@perfectlygood.in", "ops12345"),
    "customer_success": ("success@perfectlygood.in", "success12345"),
    "finance": ("finance@perfectlygood.in", "finance12345"),
}


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    out = {}
    for role, (e, p) in STAFF.items():
        try:
            out[role] = _login(e, p)
        except AssertionError:
            out[role] = None
    return out


# ── AUTH / RBAC ─────────────────────────────────────────────────────────────
class TestAuthAndRBAC:
    def test_login_returns_permissions(self, tokens):
        for role in ["admin", "operations", "finance", "customer_success"]:
            assert tokens[role], f"login {role} failed"
            me = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tokens[role]))
            assert me.status_code == 200
            data = me.json()
            assert data["role"] == role
            assert isinstance(data.get("permissions"), list)
            assert len(data["permissions"]) > 0

    def test_admin_has_all_permissions(self, tokens):
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tokens["admin"])).json()
        for p in ["manage_vendors", "manage_payouts", "manage_settings", "manage_roles", "manage_menu"]:
            assert p in me["permissions"]

    def test_operations_cannot_view_finance(self, tokens):
        r = requests.get(f"{BASE_URL}/api/ops/payouts", headers=_hdr(tokens["operations"]))
        assert r.status_code == 403

    def test_finance_cannot_create_vendor(self, tokens):
        body = {"name": "X", "email": f"xtest_{int(time.time())}@x.com", "category": "Bakery"}
        r = requests.post(f"{BASE_URL}/api/ops/vendors", json=body, headers=_hdr(tokens["finance"]))
        assert r.status_code == 403

    def test_customer_success_cannot_manage_menu(self, tokens):
        # any vendor id will do; perm-check fails before lookup
        body = {"name": "X", "original_price": 100}
        r = requests.post(f"{BASE_URL}/api/ops/vendors/vendor_xxx/menu", json=body, headers=_hdr(tokens["customer_success"]))
        assert r.status_code == 403

    def test_operations_can_view_vendors(self, tokens):
        r = requests.get(f"{BASE_URL}/api/ops/vendors", headers=_hdr(tokens["operations"]))
        assert r.status_code == 200


# ── DASHBOARD STATS ─────────────────────────────────────────────────────────
class TestDashboardStats:
    def test_stats_shape(self, tokens):
        r = requests.get(f"{BASE_URL}/api/ops/dashboard/stats", headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        d = r.json()
        for k in ["total_vendors", "active_vendors", "pending_vendors", "live_menu_items",
                  "orders_today", "orders_week", "revenue_today", "revenue_month",
                  "commission_earned", "pending_payouts"]:
            assert k in d, f"missing key: {k}"
        assert isinstance(d["total_vendors"], int)
        assert isinstance(d["revenue_today"], (int, float))


# ── VENDORS CRUD ────────────────────────────────────────────────────────────
class TestOpsVendors:
    @pytest.fixture(scope="class")
    def created_vendor(self, tokens):
        body = {
            "name": "TEST_Vendor_OPS",
            "owner_name": "Test Owner",
            "email": f"TEST_vendor_{int(time.time())}@test.com",
            "password": "vendortest123",
            "phone": "9999900001",
            "category": "Bakery",
            "full_address": "MG Road, Bangalore",
            "service_type": "both",
            "status": "active",
        }
        r = requests.post(f"{BASE_URL}/api/ops/vendors", json=body, headers=_hdr(tokens["admin"]))
        assert r.status_code == 200, r.text
        v = r.json()
        assert v["vendor_id"].startswith("vendor_")
        yield v
        # Cleanup
        requests.delete(f"{BASE_URL}/api/ops/vendors/{v['vendor_id']}", headers=_hdr(tokens["admin"]))

    def test_list_vendors_has_aggregates(self, tokens, created_vendor):
        r = requests.get(f"{BASE_URL}/api/ops/vendors?search=TEST_Vendor_OPS", headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "total" in d and "page" in d
        match = [v for v in d["items"] if v["vendor_id"] == created_vendor["vendor_id"]]
        assert match, "created vendor not in list"
        v = match[0]
        for k in ["menu_count", "order_count", "revenue"]:
            assert k in v

    def test_vendor_detail_full_profile(self, tokens, created_vendor):
        r = requests.get(f"{BASE_URL}/api/ops/vendors/{created_vendor['vendor_id']}", headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        d = r.json()
        for k in ["menu_items", "total_orders", "revenue", "commission", "net_payable",
                  "payout_history", "notes"]:
            assert k in d, f"missing key: {k}"

    def test_update_vendor(self, tokens, created_vendor):
        body = {"name": "TEST_Vendor_OPS_v2", "email": created_vendor["email"],
                "category": "Cafe", "phone": "9999900002"}
        r = requests.put(f"{BASE_URL}/api/ops/vendors/{created_vendor['vendor_id']}", json=body, headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        chk = requests.get(f"{BASE_URL}/api/ops/vendors/{created_vendor['vendor_id']}", headers=_hdr(tokens["admin"])).json()
        assert chk["name"] == "TEST_Vendor_OPS_v2"
        assert chk["category"] == "Cafe"

    def test_vendor_status_toggle(self, tokens, created_vendor):
        r = requests.put(f"{BASE_URL}/api/ops/vendors/{created_vendor['vendor_id']}/status",
                         json={"status": "inactive"}, headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        chk = requests.get(f"{BASE_URL}/api/ops/vendors/{created_vendor['vendor_id']}", headers=_hdr(tokens["admin"])).json()
        assert chk["status"] == "inactive"

    def test_add_note(self, tokens, created_vendor):
        r = requests.post(f"{BASE_URL}/api/ops/vendors/{created_vendor['vendor_id']}/notes",
                          json={"note": "TEST_internal_note"}, headers=_hdr(tokens["operations"]))
        assert r.status_code == 200
        n = r.json()
        assert n["note"] == "TEST_internal_note"
        chk = requests.get(f"{BASE_URL}/api/ops/vendors/{created_vendor['vendor_id']}", headers=_hdr(tokens["admin"])).json()
        assert any(x.get("note") == "TEST_internal_note" for x in chk.get("notes", []))


# ── MENU MGMT & AVAILABILITY -> /api/drops ──────────────────────────────────
class TestMenuAndAvailability:
    @pytest.fixture(scope="class")
    def vendor_and_item(self, tokens):
        # create a fresh vendor
        body = {"name": "TEST_MenuVendor", "email": f"TEST_menu_{int(time.time())}@t.com",
                "password": "menu12345", "category": "Bakery", "full_address": "MG Road, Bangalore"}
        v = requests.post(f"{BASE_URL}/api/ops/vendors", json=body, headers=_hdr(tokens["admin"])).json()
        # add menu item w/o discounted_price -> defaults from default_discount_pct
        item_body = {"name": "TEST_Croissant", "original_price": 200}
        ri = requests.post(f"{BASE_URL}/api/ops/vendors/{v['vendor_id']}/menu", json=item_body, headers=_hdr(tokens["admin"]))
        assert ri.status_code == 200, ri.text
        item = ri.json()
        yield v, item
        requests.delete(f"{BASE_URL}/api/ops/vendors/{v['vendor_id']}", headers=_hdr(tokens["admin"]))

    def test_menu_item_defaults_discounted_price(self, vendor_and_item):
        _, item = vendor_and_item
        # default_discount_pct=40 => 200 * 0.6 = 120
        assert item["discounted_price"] == 120, f"got {item['discounted_price']}"

    def test_update_menu_item(self, tokens, vendor_and_item):
        v, item = vendor_and_item
        body = {"name": "TEST_Croissant_v2", "original_price": 250, "discounted_price": 150}
        r = requests.put(f"{BASE_URL}/api/ops/menu/{item['menu_item_id']}", json=body, headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        menu = requests.get(f"{BASE_URL}/api/ops/vendors/{v['vendor_id']}/menu", headers=_hdr(tokens["admin"])).json()
        m = [x for x in menu if x["menu_item_id"] == item["menu_item_id"]][0]
        assert m["name"] == "TEST_Croissant_v2"
        assert m["discounted_price"] == 150

    def test_duplicate_menu_item(self, tokens, vendor_and_item):
        _, item = vendor_and_item
        r = requests.post(f"{BASE_URL}/api/ops/menu/{item['menu_item_id']}/duplicate", headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        d = r.json()
        assert d["menu_item_id"] != item["menu_item_id"]
        assert "(Copy)" in d["name"]
        assert d["available_today"] is False
        requests.delete(f"{BASE_URL}/api/ops/menu/{d['menu_item_id']}", headers=_hdr(tokens["admin"]))

    def test_availability_reflects_in_drops(self, tokens, vendor_and_item):
        _, item = vendor_and_item
        # toggle available_today=true
        r = requests.put(f"{BASE_URL}/api/ops/menu/{item['menu_item_id']}/availability",
                         json={"available_today": True}, headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        drops = requests.get(f"{BASE_URL}/api/drops").json()
        ids = [d.get("item_id") for d in drops]
        assert item["menu_item_id"] in ids, f"item not in drops after toggle on (got {len(drops)} items)"
        # required fields on drop
        d = [x for x in drops if x.get("item_id") == item["menu_item_id"]][0]
        for k in ["name", "discounted_price", "vendor_name", "vendor_location", "pickup_start_time", "pickup_end_time"]:
            assert k in d, f"drop missing {k}"
        # toggle off
        requests.put(f"{BASE_URL}/api/ops/menu/{item['menu_item_id']}/availability",
                     json={"available_today": False}, headers=_hdr(tokens["admin"]))
        drops2 = requests.get(f"{BASE_URL}/api/drops").json()
        ids2 = [d.get("item_id") for d in drops2]
        assert item["menu_item_id"] not in ids2, "item still in drops after toggle off"


# ── ORDERS, USERS, PAYOUTS, SETTINGS ────────────────────────────────────────
class TestOpsListEndpoints:
    def test_orders_list(self, tokens):
        r = requests.get(f"{BASE_URL}/api/ops/orders?range=week", headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "total" in d
        if d["items"]:
            o = d["items"][0]
            for k in ["commission", "order_value"]:
                assert k in o

    def test_users_list_aggregates(self, tokens):
        r = requests.get(f"{BASE_URL}/api/ops/users", headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        d = r.json()
        if d["items"]:
            for k in ["orders", "money_saved"]:
                assert k in d["items"][0]

    def test_payouts_math(self, tokens):
        r = requests.get(f"{BASE_URL}/api/ops/payouts", headers=_hdr(tokens["finance"]))
        assert r.status_code == 200
        rows = r.json()
        # net_payable == sales - 15% commission - 18% GST on commission
        for row in rows:
            sales = row["total_sales"]
            expected_commission = round(sales * 0.15, 2)
            expected_gst = round(expected_commission * 0.18, 2)
            expected_net = round(sales - expected_commission - expected_gst, 2)
            assert abs(row["commission"] - expected_commission) < 0.02
            assert abs(row["gst_on_commission"] - expected_gst) < 0.02
            assert abs(row["net_payable"] - expected_net) < 0.02

    def test_settings_get(self, tokens):
        r = requests.get(f"{BASE_URL}/api/ops/settings", headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        d = r.json()
        for k in ["commission_rate", "gst_on_commission", "categories", "pickup_slots", "service_types"]:
            assert k in d

    def test_settings_update_admin_only(self, tokens):
        # operations should be blocked (no manage_settings)
        r = requests.put(f"{BASE_URL}/api/ops/settings",
                         json={"default_discount_pct": 45}, headers=_hdr(tokens["operations"]))
        assert r.status_code == 403
        # admin can update
        r2 = requests.put(f"{BASE_URL}/api/ops/settings",
                          json={"default_discount_pct": 45}, headers=_hdr(tokens["admin"]))
        assert r2.status_code == 200
        assert r2.json()["default_discount_pct"] == 45
        # restore
        requests.put(f"{BASE_URL}/api/ops/settings", json={"default_discount_pct": 40}, headers=_hdr(tokens["admin"]))


# ── ROLES / STAFF / SEARCH ──────────────────────────────────────────────────
class TestRolesStaffSearch:
    def test_roles_endpoint(self, tokens):
        r = requests.get(f"{BASE_URL}/api/ops/roles", headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        d = r.json()
        assert "permissions" in d and "roles" in d
        for role in ["admin", "operations", "customer_success", "finance"]:
            assert role in d["roles"]

    def test_staff_list_requires_manage_roles(self, tokens):
        r_ops = requests.get(f"{BASE_URL}/api/ops/staff", headers=_hdr(tokens["operations"]))
        assert r_ops.status_code == 403
        r_admin = requests.get(f"{BASE_URL}/api/ops/staff", headers=_hdr(tokens["admin"]))
        assert r_admin.status_code == 200
        assert isinstance(r_admin.json(), list)

    def test_create_staff_and_update_role(self, tokens):
        email = f"TEST_staff_{int(time.time())}@t.com"
        body = {"name": "TEST Staff", "email": email, "password": "stafftest123", "role": "customer_success"}
        r = requests.post(f"{BASE_URL}/api/ops/staff", json=body, headers=_hdr(tokens["admin"]))
        assert r.status_code == 200, r.text
        uid = r.json()["user_id"]
        # update role
        r2 = requests.put(f"{BASE_URL}/api/ops/staff/{uid}/role",
                          json={"role": "finance"}, headers=_hdr(tokens["admin"]))
        assert r2.status_code == 200
        # delete
        r3 = requests.delete(f"{BASE_URL}/api/ops/staff/{uid}", headers=_hdr(tokens["admin"]))
        assert r3.status_code == 200

    def test_cannot_delete_self(self, tokens):
        # find admin user_id
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tokens["admin"])).json()
        r = requests.delete(f"{BASE_URL}/api/ops/staff/{me['user_id']}", headers=_hdr(tokens["admin"]))
        assert r.status_code == 400

    def test_search_returns_categories(self, tokens):
        r = requests.get(f"{BASE_URL}/api/ops/search?q=demo", headers=_hdr(tokens["admin"]))
        assert r.status_code == 200
        d = r.json()
        for k in ["vendors", "customers", "menu_items", "orders"]:
            assert k in d


# ── PAYOUTS WRITE FLOW ──────────────────────────────────────────────────────
class TestPayouts:
    def test_mark_paid_and_history(self, tokens):
        # Find any vendor
        vs = requests.get(f"{BASE_URL}/api/ops/vendors", headers=_hdr(tokens["admin"])).json()
        if not vs["items"]:
            pytest.skip("no vendors to test payout")
        vid = vs["items"][0]["vendor_id"]
        body = {"vendor_id": vid, "amount": 1.0, "reference_number": "TEST_REF", "method": "bank_transfer"}
        # operations should be blocked (no manage_payouts)
        r_op = requests.post(f"{BASE_URL}/api/ops/payouts/mark-paid", json=body, headers=_hdr(tokens["operations"]))
        assert r_op.status_code == 403
        # finance can
        r = requests.post(f"{BASE_URL}/api/ops/payouts/mark-paid", json=body, headers=_hdr(tokens["finance"]))
        assert r.status_code == 200
        assert r.json()["amount"] == 1.0
        # history
        h = requests.get(f"{BASE_URL}/api/ops/payouts/{vid}/history", headers=_hdr(tokens["finance"]))
        assert h.status_code == 200
        assert any(p.get("reference_number") == "TEST_REF" for p in h.json())


# ── MOBILE REGRESSION ───────────────────────────────────────────────────────
class TestMobileRegression:
    def test_drops_list_shape(self):
        r = requests.get(f"{BASE_URL}/api/drops")
        assert r.status_code == 200
        drops = r.json()
        assert isinstance(drops, list)
        if drops:
            d = drops[0]
            for k in ["item_id", "name", "discounted_price", "vendor_name", "vendor_location",
                      "pickup_start_time", "pickup_end_time"]:
                assert k in d, f"missing {k}"

    def test_drop_detail(self):
        drops = requests.get(f"{BASE_URL}/api/drops").json()
        if not drops:
            pytest.skip("no drops")
        item_id = drops[0]["item_id"]
        r = requests.get(f"{BASE_URL}/api/drops/{item_id}")
        assert r.status_code == 200
        assert r.json()["item_id"] == item_id

    def test_vendor_endpoints_still_work(self):
        login = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": "vendor@demo.com", "password": "vendor123"})
        assert login.status_code == 200
        tok = login.json()["access_token"]
        m = requests.get(f"{BASE_URL}/api/vendor/menu", headers=_hdr(tok))
        assert m.status_code == 200
        d = requests.get(f"{BASE_URL}/api/vendor/drops", headers=_hdr(tok))
        assert d.status_code == 200

    def test_order_create_verify_flow(self):
        # register a customer
        ts = int(time.time())
        email = f"TEST_cust_{ts}@t.com"
        reg = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"name": "TEST", "email": email, "phone": "9999988888", "password": "test12345"})
        assert reg.status_code == 200, reg.text
        tok = reg.json()["access_token"]
        # find a drop
        drops = requests.get(f"{BASE_URL}/api/drops").json()
        if not drops:
            pytest.skip("no drops available")
        item_id = drops[0]["item_id"]
        dp = drops[0]["discounted_price"]
        # create order
        r = requests.post(f"{BASE_URL}/api/orders/create",
                          json={"food_item_id": item_id, "quantity": 1}, headers=_hdr(tok))
        assert r.status_code == 200, r.text
        order = r.json()
        assert "razorpay_order_id" in order
        # amount = subtotal * 1.10 in paise
        expected_paise = int(round(dp * 1.10, 2) * 100)
        assert abs(order["amount"] - expected_paise) <= 100, f"got {order['amount']} expected ~{expected_paise}"
        # verify
        v = requests.post(f"{BASE_URL}/api/orders/verify",
                          json={"razorpay_order_id": order["razorpay_order_id"],
                                "razorpay_payment_id": "pay_test",
                                "razorpay_signature": "sig_test",
                                "food_item_id": item_id, "quantity": 1}, headers=_hdr(tok))
        assert v.status_code == 200, v.text
        assert v.json()["order_id"].startswith("order_")
