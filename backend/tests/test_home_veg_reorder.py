"""Iteration 22 — Home UI (Veg toggle + km/category on cards + sort) + Order-again reorder endpoint."""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://perfectly-good-build.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "anubhavg@perfectlygood.in"
ADMIN_PASSWORD = "Anubhavv"

_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
_db = _mongo[os.environ.get("DB_NAME", "perfectly_good")]

# Bengaluru coords used to have real km distance
LAT = 12.9716
LON = 77.5946


def _admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_admin_token()}"}


@pytest.fixture(scope="module")
def seed(admin_headers):
    """Create ACTIVE vendor (open-now) with 1 VEG and 1 NON-VEG item, one of them a surplus deal."""
    tag = str(int(time.time()))
    all_shift = [{"start": "00:01", "end": "23:59"}]
    hours = {d: all_shift for d in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}
    payload = {
        "name": f"TEST Home Veg {tag}",
        "category": "Bakery",
        "location": {"address": "Zeta Ave, Koramangala", "lat": LAT + 0.005, "lon": LON + 0.005},
        "hours": hours,
        "phone": "9999999999",
        "email": f"TEST_home_{tag}@test.in",
        "password": "VendorPass123!",
        "service_type": "both",
        "status": "active",
        "discount_percentage": 20,
    }
    r = requests.post(f"{API}/ops/vendors", json=payload, headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text
    vendor_id = r.json()["vendor_id"]

    # Force known lat/lon on the vendor location (geocode may return zeros for a synthetic address)
    _db.vendors.update_one(
        {"vendor_id": vendor_id},
        {"$set": {"location": {"address": "Zeta Ave, Koramangala", "lat": LAT + 0.005, "lon": LON + 0.005}}},
    )

    # Add a VEG surplus item
    veg = {
        "name": "TEST Veg Croissant",
        "description": "veg surplus",
        "original_price": 100,
        "discounted_price": 40,
        "quantity_available": 5,
        "available_today": True,
        "food_type": "veg",
        "in_stock": True,
    }
    r1 = requests.post(f"{API}/ops/vendors/{vendor_id}/menu", json=veg, headers=admin_headers, timeout=15)
    assert r1.status_code == 200, r1.text
    veg_id = r1.json()["menu_item_id"]

    # Add a NON-VEG item (in stock, not surplus so it lands in browse-deals only if vendor discount>0, otherwise fine)
    non_veg = {
        "name": "TEST Chicken Roll",
        "description": "non veg",
        "original_price": 200,
        "discounted_price": 80,
        "quantity_available": 3,
        "available_today": True,   # so it also appears in /drops as a non-veg surplus for veg filter test
        "food_type": "non_veg",
        "in_stock": True,
    }
    r2 = requests.post(f"{API}/ops/vendors/{vendor_id}/menu", json=non_veg, headers=admin_headers, timeout=15)
    assert r2.status_code == 200, r2.text
    nonveg_id = r2.json()["menu_item_id"]

    # Create a customer
    email = f"TEST_cust_{tag}@test.in"
    phone = f"98{tag[-8:]}"
    rc = requests.post(f"{API}/auth/register", json={
        "name": "TEST Cust", "email": email, "password": "CustPass123!", "phone": phone,
    }, timeout=15)
    assert rc.status_code == 200, rc.text
    cust_token = rc.json()["access_token"]

    yield {
        "vendor_id": vendor_id,
        "veg_id": veg_id,
        "nonveg_id": nonveg_id,
        "cust_headers": {"Authorization": f"Bearer {cust_token}"},
        "cust_email": email,
    }

    # Cleanup
    try:
        requests.delete(f"{API}/ops/vendors/{vendor_id}", headers=admin_headers, timeout=15)
    except Exception:
        pass


# ── /restaurants: has_veg + distance + sorted nearest-first then area ─────────
class TestRestaurantsList:
    def test_has_veg_and_distance_present(self, seed):
        r = requests.get(f"{API}/restaurants", params={"lat": LAT, "lon": LON}, timeout=20)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        mine = [x for x in rows if x["vendor_id"] == seed["vendor_id"]]
        assert mine, "seed vendor missing"
        v = mine[0]
        assert "has_veg" in v and v["has_veg"] is True
        assert "distance" in v and v["distance"] is not None
        assert isinstance(v["distance"], (int, float))
        assert "category" in v and v["category"] == "Bakery"

    def test_sorted_nearest_then_area(self, seed):
        r = requests.get(f"{API}/restaurants", params={"lat": LAT, "lon": LON}, timeout=20)
        rows = r.json()
        # Distances non-descending, None goes last
        seen_none = False
        prev = -1
        for x in rows:
            d = x.get("distance")
            if d is None:
                seen_none = True
                continue
            assert not seen_none, "None distance appeared before a real one — bad sort"
            assert d >= prev
            prev = d


# ── /drops: distance + vendor_category + food_type persisted ─────────────────
class TestDropsList:
    def test_drops_has_category_distance_food_type(self, seed):
        r = requests.get(f"{API}/drops", params={"lat": LAT, "lon": LON}, timeout=20)
        assert r.status_code == 200
        rows = r.json()
        mine = [d for d in rows if d.get("vendor_id") == seed["vendor_id"]]
        assert len(mine) >= 2  # veg + non-veg surplus items
        for d in mine:
            assert d.get("vendor_category") == "Bakery"
            assert d.get("distance") is not None and isinstance(d["distance"], (int, float))
            assert d.get("food_type") in ("veg", "non_veg")


# ── /featured-deals: vendor_category present ─────────────────────────────────
class TestFeaturedDeals:
    def test_featured_has_vendor_category(self, seed):
        r = requests.get(f"{API}/featured-deals", params={"lat": LAT, "lon": LON}, timeout=20)
        assert r.status_code == 200
        rows = r.json()
        mine = [x for x in rows if x["vendor_id"] == seed["vendor_id"]]
        # Featured picks the best deal per vendor (vendor has surplus items)
        if mine:
            f = mine[0]
            assert "vendor_category" in f and f["vendor_category"] == "Bakery"
            assert "food_type" in f
            assert "distance" in f


# ── /browse-deals: category present ──────────────────────────────────────────
class TestBrowseDeals:
    def test_browse_has_category(self, seed):
        # Vendor has discount_percentage=20 and normal (non-surplus) items? Both items are surplus (available_today=True)
        # browse-deals filters available_today != True → these items won't appear.
        # We ensure the endpoint at least works and returns category on any row.
        r = requests.get(f"{API}/browse-deals", params={"lat": LAT, "lon": LON}, timeout=20)
        assert r.status_code == 200
        rows = r.json()
        for row in rows[:5]:
            assert "category" in row


# ── /orders/{id}/reorder ─────────────────────────────────────────────────────
def _seed_past_order(admin_headers, vendor_id, item_id, cust_email):
    """Insert a past 'picked_up' order directly via mongo helper — no admin endpoint, so we use a workaround:
    place a real order via customer, mark as picked_up via ops if possible.
    Simpler: use ops manual creation isn't exposed. Fall back to direct DB via a test-only path?
    We instead create an order via the /orders/create path and manually flip status via ops.
    """
    return None  # We will test reorder against a real reserved order path — see class below.


class TestReorderEndpoint:
    def _seed_order(self, seed, item_id, order_type="surplus", status="picked_up"):
        oid = f"order_test_{uuid.uuid4().hex[:10]}"
        user = _db.users.find_one({"email": seed["cust_email"].lower()})
        assert user, f"user not found for email {seed['cust_email']}"
        _db.orders.insert_one({
            "order_id": oid,
            "user_id": user["user_id"],
            "vendor_id": seed["vendor_id"],
            "food_item_id": item_id,
            "food_item_name": "TEST item",
            "vendor_name": "TEST vendor",
            "quantity": 1,
            "order_type": order_type,
            "unit_price": 40,
            "item_subtotal": 40,
            "total_amount": 42,
            "status": status,
            "pickup_start_time": "10:00",
            "pickup_end_time": "20:00",
            "created_at": datetime.now(timezone.utc),
        })
        return oid

    def test_reorder_returns_checkout_params(self, seed):
        order_id = self._seed_order(seed, seed["veg_id"])
        r = requests.get(f"{API}/orders/{order_id}/reorder", headers=seed["cust_headers"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["itemId", "name", "price", "originalPrice", "vendorName", "maxQty", "orderType", "isOpen", "openStatusText", "todayShifts"]:
            assert k in d, f"reorder missing {k}"
        assert d["itemId"] == seed["veg_id"]
        assert d["orderType"] == "surplus"
        assert isinstance(d["todayShifts"], list)
        assert isinstance(d["isOpen"], bool)
        assert d["price"] > 0

    def test_reorder_404_for_someone_elses_order(self, seed):
        tag = str(int(time.time()))
        email = f"TEST_cust2_{tag}@test.in"
        phone = f"97{tag[-8:]}"
        rc = requests.post(f"{API}/auth/register", json={
            "name": "TEST Cust2", "email": email, "password": "CustPass123!", "phone": phone,
        }, timeout=15)
        assert rc.status_code == 200
        other = {"Authorization": f"Bearer {rc.json()['access_token']}"}
        # First seed an order owned by seed's customer
        order_id = self._seed_order(seed, seed["veg_id"])
        r = requests.get(f"{API}/orders/{order_id}/reorder", headers=other, timeout=15)
        assert r.status_code == 404

    def test_reorder_400_when_surplus_sold_out(self, seed, admin_headers):
        vid = seed["vendor_id"]
        item = {
            "name": "TEST SoldOut Item",
            "original_price": 100,
            "discounted_price": 50,
            "quantity_available": 1,
            "available_today": True,
            "food_type": "veg",
        }
        r = requests.post(f"{API}/ops/vendors/{vid}/menu", json=item, headers=admin_headers, timeout=15)
        assert r.status_code == 200
        iid = r.json()["menu_item_id"]
        oid = self._seed_order(seed, iid)
        # Flip item to unavailable directly via DB (simulates surplus sold-out)
        _db.menu_items.update_one({"menu_item_id": iid}, {"$set": {"available_today": False}})
        r2 = requests.get(f"{API}/orders/{oid}/reorder", headers=seed["cust_headers"], timeout=15)
        assert r2.status_code == 400
        assert "no longer available" in r2.json().get("detail", "").lower()
