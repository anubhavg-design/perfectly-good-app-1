"""Tests for the Jan 2026 feature batch:
   - Per-vendor discount % applied to Takeaway/Dine-in
   - Storefront image on restaurants endpoints
   - Ops RBAC (visibility, delete admin-only, assign admin-only)
   - Vendor menu edit restricted to image/kcal/protein
   - assignable-ops endpoint
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

ADMIN = {"email": "anubhavg@perfectlygood.in", "password": "Anubhavv"}
OPS = {"email": "operations@perfectlygood.in", "password": "ops12345"}
VENDOR = {"email": "vendor@demo.com", "password": "vendor123"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def ops_token():
    return _login(OPS)


@pytest.fixture(scope="module")
def vendor_token():
    return _login(VENDOR)


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------------------------------------------------------------------
# 1. Discount % applied to Takeaway/Dine-in on public restaurant endpoint
# ---------------------------------------------------------------------------
class TestRestaurantDiscount:
    def test_dv_namma_menu_has_20pct_discount(self):
        r = requests.get(f"{BASE_URL}/api/restaurants/dv_namma", timeout=15)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        v = data["vendor"]
        assert v.get("discount_percentage") == 20, f"expected 20%, got {v.get('discount_percentage')}"
        assert "storefront_image" in v
        # find Masala Dosa
        dosa = next((m for m in data["menu_items"] if m["name"].lower().startswith("masala dosa")), None)
        assert dosa is not None, "Masala Dosa not seeded on dv_namma"
        assert dosa["original_price"] == 120
        assert dosa["price"] == 96, f"expected 96 (120*0.8), got {dosa['price']}"
        assert dosa.get("discount_percentage") == 20

    def test_surplus_price_independent_of_vendor_discount(self):
        """Surplus items must still use their own discounted_price, not vendor%."""
        r = requests.get(f"{BASE_URL}/api/restaurants/dv_namma", timeout=15)
        assert r.status_code == 200
        data = r.json()
        for s in data["surplus_items"]:
            # discounted_price must be independently ≥30% off original
            op, dp = s["original_price"], s.get("discounted_price") or s["price"]
            assert dp > 0 and op > 0
            assert (op - dp) / op >= 0.29, f"surplus discount {(op-dp)/op*100}% <30% on {s['name']}"


# ---------------------------------------------------------------------------
# 2. Order creation applies discount on takeaway/dine_in but not surplus
# ---------------------------------------------------------------------------
class TestOrderPricing:
    @pytest.fixture(scope="class")
    def customer_token(self):
        """Register a fresh customer & return token."""
        import time
        email = f"TEST_pricing_{int(time.time())}@example.com"
        r = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "test1234", "name": "TEST Pricing", "phone": "9000000001"},
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text[:200]
        return r.json()["access_token"]

    @pytest.fixture(scope="class")
    def dosa_id(self):
        r = requests.get(f"{BASE_URL}/api/restaurants/dv_namma", timeout=15)
        data = r.json()
        dosa = next(m for m in data["menu_items"] if m["name"].lower().startswith("masala dosa"))
        return dosa["menu_item_id"]

    def test_takeaway_uses_discounted_price(self, customer_token, dosa_id):
        r = requests.post(
            f"{BASE_URL}/api/orders/create",
            headers=_h(customer_token),
            json={"food_item_id": dosa_id, "quantity": 2, "order_type": "takeaway"},
            timeout=20,
        )
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        # response returns Razorpay amount in paise. subtotal 2*96=192, gst=9.6, conv=9.6, total=211.2 -> 21120 paise
        assert body.get("amount") == 21120, f"expected 21120 paise, got {body.get('amount')}"

    def test_dine_in_uses_discounted_price(self, customer_token, dosa_id):
        r = requests.post(
            f"{BASE_URL}/api/orders/create",
            headers=_h(customer_token),
            json={"food_item_id": dosa_id, "quantity": 1, "order_type": "dine_in"},
            timeout=20,
        )
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        # 96 + 4.8 gst + 4.8 conv = 105.6 -> 10560 paise
        assert body.get("amount") == 10560, f"expected 10560 paise, got {body.get('amount')}"


# ---------------------------------------------------------------------------
# 3. Ops RBAC: ops sees only their vendors; admin sees all
# ---------------------------------------------------------------------------
class TestOpsVisibilityRBAC:
    def test_admin_sees_all_vendors(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/ops/vendors?page_size=200", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["total"] >= 3

    def test_ops_sees_only_assigned(self, ops_token):
        r = requests.get(f"{BASE_URL}/api/ops/vendors?page_size=200", headers=_h(ops_token), timeout=15)
        assert r.status_code == 200
        body = r.json()
        # operations@perfectlygood.in has no vendors assigned in seed → empty list
        # (main assertion: total <= admin count; individually verify all rows are assigned to that ops user)
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(ops_token), timeout=10).json()
        my_id = me["user_id"]
        for v in body["items"]:
            assert v.get("assigned_ops") == my_id, f"ops sees vendor not assigned to it: {v.get('vendor_id')}"

    def test_ops_403_on_unassigned_vendor_detail(self, ops_token):
        # dv_namma is not assigned to operations@perfectlygood.in initially
        r = requests.get(f"{BASE_URL}/api/ops/vendors/dv_namma", headers=_h(ops_token), timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"

    def test_admin_can_read_any_vendor_detail(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/ops/vendors/dv_namma", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json().get("vendor_id") == "dv_namma"


# ---------------------------------------------------------------------------
# 4. Delete vendor: admin-only
# ---------------------------------------------------------------------------
class TestDeleteVendorRBAC:
    def test_ops_delete_returns_403(self, ops_token):
        # try to delete a real vendor; ops should get 403 regardless of assignment
        r = requests.delete(f"{BASE_URL}/api/ops/vendors/dv_namma", headers=_h(ops_token), timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"

    def test_admin_delete_temp_vendor_succeeds(self, admin_token):
        import time
        email = f"TEST_delete_{int(time.time())}@example.com"
        # Admin creates a temp vendor
        r = requests.post(
            f"{BASE_URL}/api/ops/vendors",
            headers=_h(admin_token),
            json={
                "name": "TEST_DeleteVendor",
                "email": email,
                "password": "vend1234",
                "category": "Restaurant",
                "service_type": "both",
                "status": "active",
                "discount_percentage": 10,
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text[:300]
        vid = r.json()["vendor_id"]
        # admin deletes it
        d = requests.delete(f"{BASE_URL}/api/ops/vendors/{vid}", headers=_h(admin_token), timeout=15)
        assert d.status_code == 200, d.text[:200]
        # verify gone
        g = requests.get(f"{BASE_URL}/api/ops/vendors/{vid}", headers=_h(admin_token), timeout=15)
        assert g.status_code == 404


# ---------------------------------------------------------------------------
# 5. Assignable-ops + assignment ignored for ops role
# ---------------------------------------------------------------------------
class TestAssignmentRBAC:
    def test_admin_assignable_ops_lists_ops(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/ops/assignable-ops", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        emails = {o["email"] for o in arr}
        assert "operations@perfectlygood.in" in emails, f"ops email missing: {emails}"
        for o in arr:
            assert set(o.keys()) >= {"user_id", "name", "email"}

    def test_ops_cannot_change_assigned_ops(self, admin_token, ops_token):
        """Admin creates vendor assigned to ops; ops tries to reassign — server must ignore."""
        import time
        me_ops = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(ops_token), timeout=10).json()
        ops_uid = me_ops["user_id"]
        me_admin = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(admin_token), timeout=10).json()
        admin_uid = me_admin["user_id"]
        email = f"TEST_assign_{int(time.time())}@example.com"
        r = requests.post(
            f"{BASE_URL}/api/ops/vendors",
            headers=_h(admin_token),
            json={"name": "TEST_AssignVendor", "email": email, "password": "vend1234",
                  "category": "Restaurant", "assigned_ops": ops_uid, "discount_percentage": 5},
            timeout=15,
        )
        assert r.status_code == 200, r.text[:200]
        vid = r.json()["vendor_id"]
        try:
            # ops now edits vendor and attempts to reassign to admin_uid → must be ignored
            u = requests.put(
                f"{BASE_URL}/api/ops/vendors/{vid}",
                headers=_h(ops_token),
                json={"name": "TEST_AssignVendor", "email": email, "category": "Restaurant",
                      "assigned_ops": admin_uid, "discount_percentage": 5},
                timeout=15,
            )
            assert u.status_code == 200, u.text[:200]
            g = requests.get(f"{BASE_URL}/api/ops/vendors/{vid}", headers=_h(admin_token), timeout=15).json()
            assert g["assigned_ops"] == ops_uid, f"ops managed to reassign to {g['assigned_ops']}"
            # Admin can reassign to unassigned ("")
            u2 = requests.put(
                f"{BASE_URL}/api/ops/vendors/{vid}",
                headers=_h(admin_token),
                json={"name": "TEST_AssignVendor", "email": email, "category": "Restaurant",
                      "assigned_ops": "", "discount_percentage": 5},
                timeout=15,
            )
            assert u2.status_code == 200
            g2 = requests.get(f"{BASE_URL}/api/ops/vendors/{vid}", headers=_h(admin_token), timeout=15).json()
            assert g2["assigned_ops"] == ""
        finally:
            requests.delete(f"{BASE_URL}/api/ops/vendors/{vid}", headers=_h(admin_token), timeout=15)


# ---------------------------------------------------------------------------
# 6. Vendor menu edit — image/kcal/protein only; name/price/description untouched
# ---------------------------------------------------------------------------
class TestVendorMenuEdit:
    @pytest.fixture(scope="class")
    def vendor_item(self, vendor_token):
        r = requests.get(f"{BASE_URL}/api/vendor/menu", headers=_h(vendor_token), timeout=15)
        assert r.status_code == 200, r.text[:200]
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1, "vendor has no menu items"
        return items[0]

    def test_vendor_can_update_image_kcal_protein(self, vendor_token, vendor_item):
        original_name = vendor_item["name"]
        original_price = vendor_item.get("original_price")
        original_desc = vendor_item.get("description", "")
        item_id = vendor_item["menu_item_id"]
        r = requests.put(
            f"{BASE_URL}/api/vendor/menu/{item_id}",
            headers=_h(vendor_token),
            json={"image_url": "https://test.example.com/x.png", "kcal": 512, "protein": 21.5},
            timeout=15,
        )
        assert r.status_code == 200, r.text[:300]
        updated = r.json()
        assert updated["image_url"] == "https://test.example.com/x.png"
        assert updated["kcal"] == 512
        assert abs(updated["protein"] - 21.5) < 0.01
        # protected fields unchanged
        assert updated["name"] == original_name
        assert updated.get("original_price") == original_price
        assert updated.get("description", "") == original_desc

    def test_vendor_edit_ignores_name_price_description(self, vendor_token, vendor_item):
        item_id = vendor_item["menu_item_id"]
        original_name = vendor_item["name"]
        original_price = vendor_item.get("original_price")
        r = requests.put(
            f"{BASE_URL}/api/vendor/menu/{item_id}",
            headers=_h(vendor_token),
            json={"name": "HACKED", "original_price": 1, "description": "HACKED",
                  "kcal": 400, "protein": 20},
            timeout=15,
        )
        assert r.status_code == 200, r.text[:200]
        updated = r.json()
        assert updated["name"] == original_name, "vendor edited name (must be Ops-controlled)"
        assert updated.get("original_price") == original_price, "vendor edited price"

    def test_vendor_404_on_other_vendor_item(self, vendor_token):
        # vendor@demo.com is dv_namma; use a menu item from a different vendor (dv_burger, dv_slice, ...)
        rests = requests.get(f"{BASE_URL}/api/restaurants", timeout=15).json()
        foreign_vid = next((r["vendor_id"] for r in rests if r["vendor_id"] != "dv_namma"), None)
        assert foreign_vid, "no other seeded vendor available"
        detail = requests.get(f"{BASE_URL}/api/restaurants/{foreign_vid}", timeout=15).json()
        assert detail["menu_items"], f"vendor {foreign_vid} has no menu items"
        foreign_id = detail["menu_items"][0]["menu_item_id"]
        u = requests.put(
            f"{BASE_URL}/api/vendor/menu/{foreign_id}",
            headers=_h(vendor_token),
            json={"kcal": 999},
            timeout=15,
        )
        assert u.status_code == 404, f"expected 404, got {u.status_code}: {u.text[:200]}"
