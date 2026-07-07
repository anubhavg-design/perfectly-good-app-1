# Tests for the new order-type feature: restaurants API, order create/verify with
# surplus/takeaway/dine_in, and the 30% surplus discount rule.
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

CUSTOMER = {"email": "customer@demo.com", "password": "customer123"}
VENDOR = {"email": "vendor@demo.com", "password": "vendor123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def customer_token():
    return _login(CUSTOMER)


@pytest.fixture(scope="module")
def vendor_token():
    return _login(VENDOR)


# ── /api/restaurants ────────────────────────────────────────────────
class TestRestaurantsList:
    def test_list_restaurants_public(self):
        r = requests.get(f"{BASE_URL}/api/restaurants", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        first = data[0]
        for k in ("vendor_id", "name", "category", "menu_count", "surplus_count"):
            assert k in first, f"Missing field {k} in restaurant record"

    def test_list_sorted_surplus_first(self):
        r = requests.get(f"{BASE_URL}/api/restaurants", timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Once we hit a zero-surplus vendor, no later vendor may have surplus_count > 0
        seen_zero = False
        for v in data:
            if v["surplus_count"] == 0:
                seen_zero = True
            elif seen_zero:
                pytest.fail("Vendors with surplus not sorted before vendors without surplus")

    def test_list_with_lat_lon_distance(self):
        r = requests.get(f"{BASE_URL}/api/restaurants?lat=12.9716&lon=77.5946", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        # At least one vendor should have distance computed
        has_distance = any(v.get("distance") is not None for v in data)
        assert has_distance, "Expected some vendor to have distance when lat/lon provided"


# ── /api/restaurants/{vendor_id} ────────────────────────────────────
class TestRestaurantDetail:
    @pytest.fixture(scope="class")
    def vendor_with_surplus(self):
        r = requests.get(f"{BASE_URL}/api/restaurants", timeout=15)
        assert r.status_code == 200
        for v in r.json():
            if v["surplus_count"] > 0:
                return v
        pytest.skip("No vendor with surplus items in DB")

    def test_get_restaurant_shape(self, vendor_with_surplus):
        r = requests.get(f"{BASE_URL}/api/restaurants/{vendor_with_surplus['vendor_id']}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "vendor" in data and "surplus_items" in data and "menu_items" in data
        assert data["vendor"]["vendor_id"] == vendor_with_surplus["vendor_id"]

    def test_surplus_items_have_discount_and_available_today(self, vendor_with_surplus):
        r = requests.get(f"{BASE_URL}/api/restaurants/{vendor_with_surplus['vendor_id']}", timeout=15)
        data = r.json()
        assert len(data["surplus_items"]) > 0
        for it in data["surplus_items"]:
            assert it["available_today"] is True
            assert it.get("discounted_price") is not None
            # Surplus price used for "price"
            assert it["price"] == it["discounted_price"]
            assert it["discount"] >= 0

    def test_menu_items_use_original_price(self, vendor_with_surplus):
        r = requests.get(f"{BASE_URL}/api/restaurants/{vendor_with_surplus['vendor_id']}", timeout=15)
        data = r.json()
        assert len(data["menu_items"]) > 0
        for it in data["menu_items"]:
            assert it["price"] == it["original_price"]

    def test_get_restaurant_404(self):
        r = requests.get(f"{BASE_URL}/api/restaurants/vendor_doesnotexist", timeout=15)
        assert r.status_code == 404


# ── Order create/verify with order_type ─────────────────────────────
class TestOrderTypes:
    @pytest.fixture(scope="class")
    def surplus_context(self):
        rs = requests.get(f"{BASE_URL}/api/restaurants", timeout=15).json()
        for v in rs:
            if v["surplus_count"] > 0:
                r = requests.get(f"{BASE_URL}/api/restaurants/{v['vendor_id']}", timeout=15).json()
                if r["surplus_items"]:
                    return {
                        "vendor": v,
                        "surplus_item": r["surplus_items"][0],
                        "menu_item": (r["menu_items"] or [r["surplus_items"][0]])[0],
                    }
        pytest.skip("No surplus item available for order tests")

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def test_create_surplus_order_uses_discounted_price(self, customer_token, surplus_context):
        item = surplus_context["surplus_item"]
        r = requests.post(
            f"{BASE_URL}/api/orders/create",
            json={"food_item_id": item["menu_item_id"], "quantity": 1, "order_type": "surplus"},
            headers=self._auth(customer_token), timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "razorpay_order_id" in data and "amount" in data
        subtotal = item["discounted_price"] * 1
        gst = round(subtotal * 0.05, 2)
        conv = round(subtotal * 0.05, 2)
        expected = int(round(subtotal + gst + conv, 2) * 100)
        assert data["amount"] == expected, f"Expected {expected} paise, got {data['amount']}"

    def test_create_takeaway_uses_original_price(self, customer_token, surplus_context):
        item = surplus_context["menu_item"]
        r = requests.post(
            f"{BASE_URL}/api/orders/create",
            json={"food_item_id": item["menu_item_id"], "quantity": 2, "order_type": "takeaway"},
            headers=self._auth(customer_token), timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        subtotal = item["original_price"] * 2
        gst = round(subtotal * 0.05, 2)
        conv = round(subtotal * 0.05, 2)
        expected = int(round(subtotal + gst + conv, 2) * 100)
        assert data["amount"] == expected

    def test_create_dine_in_uses_original_price_any_menu_item(self, customer_token, surplus_context):
        # Dine-in should work even on a menu item that is NOT available_today
        r = requests.get(f"{BASE_URL}/api/restaurants/{surplus_context['vendor']['vendor_id']}", timeout=15).json()
        # Find a menu item not marked available_today (if any) else fall back to any
        non_surplus = next((m for m in r["menu_items"] if not m.get("available_today")), r["menu_items"][0])
        r2 = requests.post(
            f"{BASE_URL}/api/orders/create",
            json={"food_item_id": non_surplus["menu_item_id"], "quantity": 1, "order_type": "dine_in"},
            headers=self._auth(customer_token), timeout=15,
        )
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["amount"] > 0

    def test_verify_persists_order_type_and_price(self, customer_token, surplus_context):
        item = surplus_context["surplus_item"]
        c = requests.post(
            f"{BASE_URL}/api/orders/create",
            json={"food_item_id": item["menu_item_id"], "quantity": 1, "order_type": "takeaway"},
            headers=self._auth(customer_token), timeout=15,
        ).json()
        v = requests.post(
            f"{BASE_URL}/api/orders/verify",
            json={
                "razorpay_order_id": c["razorpay_order_id"],
                "razorpay_payment_id": "pay_mock_" + c["razorpay_order_id"][-6:],
                "razorpay_signature": "sig_mock",
                "food_item_id": item["menu_item_id"],
                "quantity": 1,
                "order_type": "takeaway",
            },
            headers=self._auth(customer_token), timeout=15,
        )
        assert v.status_code == 200, v.text
        order_id = v.json()["order_id"]
        # Fetch user orders to inspect stored order_type + unit price
        my = requests.get(
            f"{BASE_URL}/api/orders/user",
            headers=self._auth(customer_token), timeout=15,
        ).json()
        record = next((o for o in my if o["order_id"] == order_id), None)
        assert record is not None
        assert record["order_type"] == "takeaway"
        # Takeaway uses original price
        assert record["discounted_price"] == item["original_price"]

    def test_surplus_quantity_decrement(self, customer_token, surplus_context):
        item = surplus_context["surplus_item"]
        if item.get("quantity_available") in (None, 0):
            pytest.skip("Item has no tracked quantity to decrement")
        before = item["quantity_available"]
        c = requests.post(
            f"{BASE_URL}/api/orders/create",
            json={"food_item_id": item["menu_item_id"], "quantity": 1, "order_type": "surplus"},
            headers=self._auth(customer_token), timeout=15,
        ).json()
        requests.post(
            f"{BASE_URL}/api/orders/verify",
            json={
                "razorpay_order_id": c["razorpay_order_id"],
                "razorpay_payment_id": "pay_mock",
                "razorpay_signature": "sig_mock",
                "food_item_id": item["menu_item_id"],
                "quantity": 1,
                "order_type": "surplus",
            },
            headers=self._auth(customer_token), timeout=15,
        )
        r = requests.get(f"{BASE_URL}/api/restaurants/{surplus_context['vendor']['vendor_id']}", timeout=15).json()
        updated = next((i for i in r["surplus_items"] if i["menu_item_id"] == item["menu_item_id"]), None)
        if updated:
            assert updated["quantity_available"] == before - 1

    def test_surplus_rejects_over_quantity(self, customer_token, surplus_context):
        item = surplus_context["surplus_item"]
        qa = item.get("quantity_available")
        if qa is None:
            pytest.skip("No quantity tracked")
        r = requests.post(
            f"{BASE_URL}/api/orders/create",
            json={"food_item_id": item["menu_item_id"], "quantity": qa + 100, "order_type": "surplus"},
            headers=self._auth(customer_token), timeout=15,
        )
        assert r.status_code == 400


# ── 30% rule on vendor drops ────────────────────────────────────────
class Test30PercentRule:
    def test_reject_less_than_30_percent_off(self, vendor_token):
        headers = {"Authorization": f"Bearer {vendor_token}", "Content-Type": "application/json"}
        menu = requests.get(f"{BASE_URL}/api/vendor/menu", headers=headers, timeout=15).json()
        assert isinstance(menu, list) and len(menu) > 0
        item = menu[0]
        op = item.get("original_price") or 0
        assert op > 0
        # discount of only 10% => discounted_price = 0.9 * op, should be rejected
        r = requests.post(
            f"{BASE_URL}/api/vendor/drops",
            json={
                "menu_item_id": item["menu_item_id"],
                "discounted_price": round(op * 0.9, 2),
                "quantity_available": 5,
                "pickup_start_time": "18:00",
                "pickup_end_time": "21:00",
            },
            headers=headers, timeout=15,
        )
        assert r.status_code == 400, f"Expected 400 for insufficient discount, got {r.status_code} {r.text}"
        assert "30%" in r.json().get("detail", "") or "menu price" in r.json().get("detail", "").lower()

    def test_accept_exactly_30_percent_off(self, vendor_token):
        headers = {"Authorization": f"Bearer {vendor_token}", "Content-Type": "application/json"}
        menu = requests.get(f"{BASE_URL}/api/vendor/menu", headers=headers, timeout=15).json()
        item = menu[0]
        op = item.get("original_price") or 0
        r = requests.post(
            f"{BASE_URL}/api/vendor/drops",
            json={
                "menu_item_id": item["menu_item_id"],
                "discounted_price": round(op * 0.7, 2),  # exactly 30% off
                "quantity_available": 5,
                "pickup_start_time": "18:00",
                "pickup_end_time": "21:00",
            },
            headers=headers, timeout=15,
        )
        assert r.status_code == 200, f"Expected 200 for 30% off, got {r.status_code} {r.text}"
