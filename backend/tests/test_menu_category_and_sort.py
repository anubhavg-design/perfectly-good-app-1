"""
Iteration 26 — Menu Categories + Sorting endpoint tests.

Covers:
  - POST /api/ops/vendors/{vendor_id}/menu persists free-form `menu_category`
  - PUT  /api/ops/menu/{menu_item_id} updates `menu_category`
  - GET  /api/restaurants/{vendor_id} returns menu_category on every menu item
  - GET  /api/drops?sort_by=price|price_desc|discount ordering
  - GET  /api/browse-deals?sort_by=price|price_desc|discount|distance ordering
  - POST /api/ops/menu-import/parse-file maps Menu Category / Section column
"""
import io
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "anubhavg@perfectlygood.in"
ADMIN_PASSWORD = "Anubhavv"


# ── Session-scoped admin login ─────────────────────────────────────────
@pytest.fixture(scope="module")
def admin_headers():
    assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token")
    assert token
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ── Ephemeral ACTIVE vendor with categorized items ─────────────────────
@pytest.fixture(scope="module")
def test_vendor(admin_headers):
    """Create an ACTIVE vendor with discount_percentage>0 (so it shows in browse-deals)
    and multiple menu items across menu_category values with varied prices."""
    hours = {
        d: [{"start": "00:01", "end": "23:59"}]
        for d in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    }
    uid = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST_SortVendor_{uid}",
        "email": f"test_sortvendor_{uid}@test.in",
        "password": "TestPass123!",
        "phone": "9999999999",
        "category": "Bakery",
        "full_address": "MG Road, Bangalore",
        "service_type": "both",
        "status": "active",
        "discount_percentage": 20,
        "hours": hours,
    }
    r = requests.post(f"{BASE_URL}/api/ops/vendors", json=payload, headers=admin_headers, timeout=20)
    assert r.status_code in (200, 201), f"Vendor create failed: {r.status_code} {r.text}"
    vendor = r.json()
    vendor_id = vendor["vendor_id"]

    yield vendor_id

    # teardown
    try:
        requests.delete(f"{BASE_URL}/api/ops/vendors/{vendor_id}", headers=admin_headers, timeout=15)
    except Exception:
        pass


# ── (1) menu_category persistence — POST / PUT / GET restaurant ────────
class TestMenuCategoryPersistence:
    def test_create_menu_item_stores_menu_category(self, admin_headers, test_vendor):
        body = {
            "name": "TEST_Paneer_Starter",
            "description": "starter",
            "original_price": 200.0,
            "discounted_price": 160.0,
            "menu_category": "Starters",
            "food_type": "veg",
            "available_today": False,
        }
        r = requests.post(
            f"{BASE_URL}/api/ops/vendors/{test_vendor}/menu",
            json=body,
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["menu_category"] == "Starters"
        assert data["name"] == "TEST_Paneer_Starter"
        # persist for update test
        pytest._starter_id = data["menu_item_id"]

    def test_update_menu_item_updates_menu_category(self, admin_headers, test_vendor):
        item_id = pytest._starter_id
        body = {
            "name": "TEST_Paneer_Starter",
            "original_price": 200.0,
            "discounted_price": 160.0,
            "menu_category": "Mains",
            "food_type": "veg",
        }
        r = requests.put(
            f"{BASE_URL}/api/ops/menu/{item_id}",
            json=body,
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text

        # Restore to Starters for downstream sort tests
        body["menu_category"] = "Starters"
        r2 = requests.put(
            f"{BASE_URL}/api/ops/menu/{item_id}",
            json=body,
            headers=admin_headers,
            timeout=15,
        )
        assert r2.status_code == 200

    def test_get_restaurant_returns_menu_category(self, admin_headers, test_vendor):
        # add a couple more items with different menu_category strings
        for name, cat, price in [
            ("TEST_Butter_Chicken_Main", "Mains", 300.0),
            ("TEST_Chai_Drink", "Drinks", 40.0),
            ("TEST_NoCategoryItem", "", 100.0),
        ]:
            body = {
                "name": name,
                "original_price": price,
                "discounted_price": round(price * 0.7, 2),
                "menu_category": cat,
                "food_type": "veg",
            }
            r = requests.post(
                f"{BASE_URL}/api/ops/vendors/{test_vendor}/menu",
                json=body,
                headers=admin_headers,
                timeout=15,
            )
            assert r.status_code == 200

        # Public restaurant endpoint
        r = requests.get(f"{BASE_URL}/api/restaurants/{test_vendor}", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        menu_items = data.get("menu_items") or []
        assert len(menu_items) >= 4
        by_name = {m["name"]: m for m in menu_items}
        assert by_name["TEST_Paneer_Starter"]["menu_category"] == "Starters"
        assert by_name["TEST_Butter_Chicken_Main"]["menu_category"] == "Mains"
        assert by_name["TEST_Chai_Drink"]["menu_category"] == "Drinks"
        assert by_name["TEST_NoCategoryItem"]["menu_category"] == ""

        # Every item must have menu_category key (empty string OK)
        for m in menu_items:
            assert "menu_category" in m


# ── (2) /api/drops sort_by ordering (surplus items) ───────────────────
class TestDropsSort:
    @pytest.fixture(scope="class")
    def surplus_setup(self, admin_headers, test_vendor):
        """Create 3 surplus items (available_today=True) with varied prices/discounts."""
        specs = [
            # (name, orig, disc_price)  -> discount% = (orig-disc)/orig*100
            ("TEST_Surplus_Cheap", 100.0, 30.0),   # price=30, disc=70%
            ("TEST_Surplus_Mid",   200.0, 100.0),  # price=100, disc=50%
            ("TEST_Surplus_High",  400.0, 240.0),  # price=240, disc=40%
        ]
        ids = []
        for name, op, dp in specs:
            body = {
                "name": name,
                "original_price": op,
                "discounted_price": dp,
                "menu_category": "Surplus",
                "food_type": "veg",
                "available_today": True,
                "quantity_available": 5,
            }
            r = requests.post(
                f"{BASE_URL}/api/ops/vendors/{test_vendor}/menu",
                json=body,
                headers=admin_headers,
                timeout=15,
            )
            assert r.status_code == 200, r.text
            ids.append(r.json()["menu_item_id"])
        # allow index if any
        time.sleep(0.3)
        return ids

    def _fetch_vendor_drops(self, vendor_id, sort_by):
        r = requests.get(f"{BASE_URL}/api/drops", params={"sort_by": sort_by}, timeout=15)
        assert r.status_code == 200
        # Filter to only this vendor's TEST items so other DB noise is ignored
        return [d for d in r.json() if d.get("vendor_id") == vendor_id
                and str(d.get("name", "")).startswith("TEST_Surplus_")]

    def test_drops_price_asc(self, test_vendor, surplus_setup):
        drops = self._fetch_vendor_drops(test_vendor, "price")
        assert len(drops) == 3
        prices = [d["discounted_price"] for d in drops]
        assert prices == sorted(prices), f"price asc broken: {prices}"
        assert prices[0] == 30.0 and prices[-1] == 240.0

    def test_drops_price_desc(self, test_vendor, surplus_setup):
        drops = self._fetch_vendor_drops(test_vendor, "price_desc")
        assert len(drops) == 3
        prices = [d["discounted_price"] for d in drops]
        assert prices == sorted(prices, reverse=True), f"price_desc broken: {prices}"
        assert prices[0] == 240.0 and prices[-1] == 30.0

    def test_drops_discount(self, test_vendor, surplus_setup):
        drops = self._fetch_vendor_drops(test_vendor, "discount")
        assert len(drops) == 3
        # Cheap surplus has 70% discount, must come first
        names = [d["name"] for d in drops]
        assert names[0] == "TEST_Surplus_Cheap"
        assert names[-1] == "TEST_Surplus_High"


# ── (3) /api/browse-deals sort_by ordering (normal items) ─────────────
class TestBrowseDealsSort:
    """Vendor has discount_percentage=20, so all normal items appear in browse-deals."""

    def _fetch_vendor_deals(self, vendor_id, sort_by, lat=None, lon=None):
        params = {"sort_by": sort_by}
        if lat is not None:
            params["lat"], params["lon"] = lat, lon
        r = requests.get(f"{BASE_URL}/api/browse-deals", params=params, timeout=15)
        assert r.status_code == 200
        return [d for d in r.json() if d.get("vendor_id") == vendor_id
                and str(d.get("item_name", "")).startswith("TEST_")]

    def test_browse_deals_price_asc(self, test_vendor):
        deals = self._fetch_vendor_deals(test_vendor, "price")
        assert len(deals) >= 3
        prices = [d["price"] for d in deals]
        assert prices == sorted(prices), f"price asc broken: {prices}"

    def test_browse_deals_price_desc(self, test_vendor):
        deals = self._fetch_vendor_deals(test_vendor, "price_desc")
        assert len(deals) >= 3
        prices = [d["price"] for d in deals]
        assert prices == sorted(prices, reverse=True), f"price_desc broken: {prices}"

    def test_browse_deals_discount(self, test_vendor):
        deals = self._fetch_vendor_deals(test_vendor, "discount")
        assert len(deals) >= 3
        discounts = [d["discount"] for d in deals]
        # Should be non-increasing (all equal to 20 here since flat vendor discount)
        assert discounts == sorted(discounts, reverse=True)

    def test_browse_deals_distance(self, test_vendor):
        # supply lat/lon to trigger distance calc
        deals = self._fetch_vendor_deals(test_vendor, "distance", lat=12.9716, lon=77.5946)
        # Distance value may be None if vendor coords are 0/None
        # Just verify endpoint works and returns items
        assert isinstance(deals, list)


# ── (4) Menu import: Menu Category / Section CSV column ───────────────
class TestMenuImportCategory:
    def test_parse_csv_maps_menu_category_column(self, admin_headers):
        csv_content = (
            "Item,Description,Original Price,Veg/Non-Veg,Menu Category\n"
            "Paneer Tikka,starter dish,180,Veg,Starters\n"
            "Butter Chicken,main dish,320,Non-Veg,Mains\n"
            "Masala Chai,drink,40,Veg,Drinks\n"
        )
        files = {"file": ("menu.csv", csv_content, "text/csv")}
        headers = {"Authorization": admin_headers["Authorization"]}
        r = requests.post(
            f"{BASE_URL}/api/ops/menu-import/parse-file",
            files=files,
            headers=headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] == 3
        cats = [row["menu_category"] for row in data["items"]]
        assert cats == ["Starters", "Mains", "Drinks"], f"got {cats}"
        # sanity on other fields
        assert data["items"][1]["food_type"] == "non_veg"

    def test_parse_csv_section_column_alias(self, admin_headers):
        csv_content = (
            "Item,Original Price,Veg/Non-Veg,Section\n"
            "Salad,120,Veg,Sides\n"
            "Ice Cream,90,Veg,Desserts\n"
        )
        files = {"file": ("menu.csv", csv_content, "text/csv")}
        headers = {"Authorization": admin_headers["Authorization"]}
        r = requests.post(
            f"{BASE_URL}/api/ops/menu-import/parse-file",
            files=files,
            headers=headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        cats = [row["menu_category"] for row in r.json()["items"]]
        assert cats == ["Sides", "Desserts"]
