"""
Tests for pagination (list_restaurants & browse_deals) + MongoDB indexes.
Iteration 24 - Performance audit for Home + Browse Deals.
"""
import os
import pytest
import requests
from dotenv import load_dotenv

# Load backend/.env so MONGO_URL / DB_NAME are visible to the test process
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to internal
    BASE_URL = "http://localhost:8001"
API = f"{BASE_URL}/api"


# ── Pagination: /restaurants ──────────────────────────────────────────
class TestRestaurantsPagination:
    def test_full_list_no_limit(self):
        r = requests.get(f"{API}/restaurants", timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_limit_1_offset_0(self):
        r = requests.get(f"{API}/restaurants?limit=1&offset=0", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) <= 1

    def test_limit_1_offset_1_differs_from_offset_0(self):
        r0 = requests.get(f"{API}/restaurants?limit=1&offset=0", timeout=30).json()
        r1 = requests.get(f"{API}/restaurants?limit=1&offset=1", timeout=30).json()
        full = requests.get(f"{API}/restaurants", timeout=30).json()
        # If we have >=2 active vendors, the pages must differ.
        if len(full) >= 2:
            assert r0 and r1
            assert r0[0]["vendor_id"] != r1[0]["vendor_id"], (
                f"Pagination not slicing correctly: offset=0 and offset=1 returned the same vendor: {r0[0]['vendor_id']}"
            )
        else:
            pytest.skip(f"Only {len(full)} active vendor(s); cannot exercise offset slicing.")

    def test_limit_matches_slice_of_full(self):
        full = requests.get(f"{API}/restaurants", timeout=30).json()
        page = requests.get(f"{API}/restaurants?limit=12&offset=0", timeout=30).json()
        # First-page vendor_ids must match the first 12 of the full list.
        assert [x["vendor_id"] for x in page] == [x["vendor_id"] for x in full[:12]]


# ── Pagination: /browse-deals ─────────────────────────────────────────
class TestBrowseDealsPagination:
    def test_full_list_no_limit(self):
        r = requests.get(f"{API}/browse-deals", timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_limit_15_returns_at_most_15(self):
        r = requests.get(f"{API}/browse-deals?limit=15&offset=0", timeout=30)
        assert r.status_code == 200
        assert len(r.json()) <= 15

    def test_offset_slices_correctly(self):
        full = requests.get(f"{API}/browse-deals", timeout=30).json()
        if len(full) < 2:
            pytest.skip(f"Only {len(full)} browse-deal item(s); cannot exercise offset.")
        p0 = requests.get(f"{API}/browse-deals?limit=1&offset=0", timeout=30).json()
        p1 = requests.get(f"{API}/browse-deals?limit=1&offset=1", timeout=30).json()
        assert p0[0]["item_id"] != p1[0]["item_id"]

    def test_pagination_preserves_sort(self):
        # limit=all sorted vs sliced pages should be equivalent
        full = requests.get(f"{API}/browse-deals?sort_by=discount", timeout=30).json()
        p0 = requests.get(f"{API}/browse-deals?sort_by=discount&limit=5&offset=0", timeout=30).json()
        assert [x["item_id"] for x in p0] == [x["item_id"] for x in full[:5]]


# ── MongoDB indexes ────────────────────────────────────────────────────
class TestMongoIndexes:
    @pytest.fixture(scope="class")
    def indexes(self):
        import asyncio
        import motor.motor_asyncio

        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        assert mongo_url and db_name, "MONGO_URL/DB_NAME must be set"

        async def gather():
            client = motor.motor_asyncio.AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            return {
                "vendors": await db.vendors.index_information(),
                "menu_items": await db.menu_items.index_information(),
                "orders": await db.orders.index_information(),
            }

        return asyncio.get_event_loop().run_until_complete(gather())

    @staticmethod
    def _has(idx_info, keys):
        want = [tuple(k) for k in keys]
        for _, meta in idx_info.items():
            got = [tuple(k) for k in meta.get("key", [])]
            if got == want:
                return True
        return False

    def test_vendors_status_index(self, indexes):
        assert self._has(indexes["vendors"], [["status", 1]]), (
            f"vendors.status index missing. Have: {list(indexes['vendors'].keys())}"
        )

    def test_vendors_status_category_compound(self, indexes):
        assert self._has(indexes["vendors"], [["status", 1], ["category", 1]])

    def test_menu_items_vendor_available_today(self, indexes):
        assert self._has(indexes["menu_items"], [["vendor_id", 1], ["available_today", 1]])

    def test_menu_items_vendor_in_stock(self, indexes):
        assert self._has(indexes["menu_items"], [["vendor_id", 1], ["in_stock", 1]])

    def test_menu_items_food_type(self, indexes):
        assert self._has(indexes["menu_items"], [["food_type", 1]])

    def test_orders_vendor_status(self, indexes):
        assert self._has(indexes["orders"], [["vendor_id", 1], ["status", 1]])

    def test_orders_user_status(self, indexes):
        assert self._has(indexes["orders"], [["user_id", 1], ["status", 1]])


# ── Backward compat: restaurant details & featured-deals still work ───
class TestBackwardCompat:
    def test_featured_deals(self):
        r = requests.get(f"{API}/featured-deals", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_restaurants_list_shape(self):
        r = requests.get(f"{API}/restaurants", timeout=30)
        assert r.status_code == 200
        data = r.json()
        if data:
            v = data[0]
            for k in ("vendor_id", "name", "category", "menu_count", "surplus_count", "has_veg"):
                assert k in v, f"missing key {k} in restaurant: {list(v.keys())}"
