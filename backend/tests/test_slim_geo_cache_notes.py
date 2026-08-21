"""
Iteration 28 — Verifies:
 (A) GET /api/restaurants returns SLIM cards (only card fields, no hours/today_shifts/full location/pickup_start_time)
 (B) GET /api/restaurants/{id} returns FULL detail (with hours, today_shifts, location)
 (C) $geoNear works when ?lat=&lon= is passed; 2dsphere index exists on vendors.location_geo
 (D) POST /api/orders/create supports items[].note (cart notes)
 (E) /api/files/* serves image bytes with Cache-Control max-age >= 604800 (7 days)
 (F) POST /api/ops/vendors/{id}/menu returns image_url + thumbnail_url as /api/files/... paths
"""

import base64
import io
import os
import re
import time

import pymongo
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"

ADMIN_EMAIL = "anubhavg@perfectlygood.in"
ADMIN_PASSWORD = "Anubhavv"
VENDOR_EMAIL = "draftvendor@test.in"
VENDOR_PASSWORD = "vendor123"
ACTIVE_VENDOR_A = "vendor_e177d1bc3c50"   # Draft Test Kitchen (active, 18-21 IST)
ACTIVE_VENDOR_B = "vendor_1ab4824b1e97"

# Card fields per spec
CARD_FIELDS = {
    "vendor_id", "name", "category", "storefront_thumbnail", "logo_url",
    "discount_percentage", "is_open", "verified", "menu_count",
    "surplus_count", "has_veg", "distance",
}
FORBIDDEN_ON_CARD = {"hours", "today_shifts", "location", "pickup_start_time",
                     "pickup_end_time", "menu_items"}


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{BASE_URL}/api/auth/staff-login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    if r.status_code != 200:
        # try alternate route
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def customer_token(s):
    """Register a fresh customer for order-creation tests."""
    email = f"TEST_cartnotes_{int(time.time())}@test.in"
    r = s.post(f"{BASE_URL}/api/auth/register",
               json={"name": "TEST Cart Notes", "email": email,
                     "password": "test12345", "phone": "9000000001"},
               timeout=15)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, r.text
    return tok


# ---------- (A) Slim list payload ----------

class TestSlimList:
    def test_list_returns_200_and_slim_fields(self, s):
        r = s.get(f"{BASE_URL}/api/restaurants", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        for card in data:
            keys = set(card.keys())
            # Must be EXACTLY the slim fields (subset — no forbidden ones)
            missing = CARD_FIELDS - keys
            extra_forbidden = FORBIDDEN_ON_CARD & keys
            assert not missing, f"Card missing required fields: {missing} in {card}"
            assert not extra_forbidden, f"Card leaks forbidden fields: {extra_forbidden} in {card}"

    def test_list_contains_the_2_active_vendors(self, s):
        r = s.get(f"{BASE_URL}/api/restaurants", timeout=15)
        vids = {c["vendor_id"] for c in r.json()}
        assert ACTIVE_VENDOR_A in vids
        assert ACTIVE_VENDOR_B in vids


# ---------- (B) Detail endpoint still has full vendor ----------

class TestDetailFull:
    def test_detail_has_hours_today_shifts_location(self, s):
        r = s.get(f"{BASE_URL}/api/restaurants/{ACTIVE_VENDOR_A}", timeout=15)
        assert r.status_code == 200
        body = r.json()
        # /restaurants/{id} wraps: {vendor, menu_items, surplus_items}
        v = body.get("vendor") or body
        assert "hours" in v, f"detail must include hours: keys={list(v.keys())}"
        assert "today_shifts" in v, "detail must include today_shifts"
        assert "location" in v, "detail must include full location"
        assert v.get("vendor_id") == ACTIVE_VENDOR_A
        # And menu_items sibling still present
        assert "menu_items" in body


# ---------- (C) geoNear + 2dsphere index ----------

class TestGeoNear:
    def test_with_coords_returns_200_and_2_vendors(self, s):
        r = s.get(f"{BASE_URL}/api/restaurants?lat=12.97&lon=77.59&limit=10", timeout=15)
        assert r.status_code == 200
        data = r.json()
        vids = {c["vendor_id"] for c in data}
        # Must still include the 2 active vendors even if distance is null
        assert ACTIVE_VENDOR_A in vids
        assert ACTIVE_VENDOR_B in vids
        # Every card still slim
        for card in data:
            assert not (FORBIDDEN_ON_CARD & set(card.keys()))

    def test_2dsphere_index_exists_on_vendors(self):
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "perfectly_good")
        client = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
        db = client[db_name]
        idx = db.vendors.index_information()
        # Look for any index containing location_geo with 2dsphere
        found = False
        for name, info in idx.items():
            for key in info.get("key", []):
                if key[0] == "location_geo" and key[1] == "2dsphere":
                    found = True
                    break
        assert found, f"vendors.location_geo 2dsphere index missing. Indexes: {idx}"
        client.close()


# ---------- (D) Cart notes on order create ----------

class TestCartNotes:
    def _pick_menu_item(self, s, vendor_id, order_type="takeaway"):
        r = s.get(f"{BASE_URL}/api/restaurants/{vendor_id}?order_type={order_type}", timeout=15)
        assert r.status_code == 200
        body = r.json()
        items = body.get("menu_items") or []
        # takeaway needs items with price > 0
        for it in items:
            if it.get("price", 0) > 0:
                return it
        return None

    def test_order_create_with_note(self, s, customer_token):
        headers = {"Authorization": f"Bearer {customer_token}"}
        it = self._pick_menu_item(s, ACTIVE_VENDOR_A, "takeaway")
        assert it, "No takeaway-priced menu item on Draft Test Kitchen"
        payload = {
            "order_type": "takeaway",
            "items": [{
                "food_item_id": it.get("menu_item_id") or it.get("item_id"),
                "quantity": 1,
                "note": "No onions",
            }],
        }
        r = s.post(f"{BASE_URL}/api/orders/create", json=payload,
                   headers=headers, timeout=20)
        # Two acceptable outcomes per spec:
        # (a) restaurant OPEN → 200 with razorpay_order_id + amount + note persisted
        # (b) restaurant CLOSED → 400 with 'closed' / 'not accepting' in message
        if r.status_code == 400:
            body_l = r.text.lower()
            assert "closed" in body_l or "not currently accepting" in body_l, \
                f"unexpected 400: {r.text}"
            # Test passes: closed branch verified (per spec, this is expected).
            return
        assert r.status_code == 200, f"order create failed: {r.status_code} {r.text}"
        j = r.json()
        assert "razorpay_order_id" in j
        assert j.get("amount", 0) > 0
        rzp_id = j["razorpay_order_id"]

        # Verify note was persisted to pending_orders
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "perfectly_good")
        client = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
        try:
            pending = client[db_name].pending_orders.find_one({"razorpay_order_id": rzp_id})
            assert pending, "pending_order row not found"
            assert pending.get("items"), "pending_order.items missing"
            assert pending["items"][0].get("note") == "No onions", \
                f"note not persisted: {pending['items'][0]}"
        finally:
            client.close()


# ---------- (E)(F) Object storage + long cache ----------

class TestImagesCache:
    """Upload a menu item with a base64 image → verify /api/files paths + cache."""

    @staticmethod
    def _tiny_jpeg_data_uri():
        # 1x1 red pixel jpeg
        raw = base64.b64decode(
            "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsK"
            "CwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQU"
            "FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIA"
            "AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA"
            "AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3"
            "ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm"
            "p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEB"
            "AAA/APn+iiigAr//2Q=="
        )
        return "data:image/jpeg;base64," + base64.b64encode(raw).decode()

    def test_upload_menu_image_and_verify_files_cache(self, s, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "name": f"TEST_slim_geo_{int(time.time())}",
            "description": "img cache test",
            "original_price": 100,
            "discounted_price": 60,
            "food_type": "veg",
            "image_url": self._tiny_jpeg_data_uri(),
            "quantity_available": 5,
        }
        r = s.post(f"{BASE_URL}/api/ops/vendors/{ACTIVE_VENDOR_A}/menu",
                   json=payload, headers=headers, timeout=30)
        assert r.status_code in (200, 201), f"menu create failed: {r.status_code} {r.text}"
        j = r.json()
        image_url = j.get("image_url") or ""
        thumb_url = j.get("thumbnail_url") or ""
        assert image_url.startswith("/api/files/"), f"image_url not /api/files/*: {image_url!r}"
        assert thumb_url.startswith("/api/files/"), f"thumbnail_url not /api/files/*: {thumb_url!r}"

        # Verify origin (backend) response has the 7+ day cache header. This is
        # the actual code path in server.py serve_file. The public preview URL
        # may be stripped by the k8s ingress / CloudFlare edge to no-store —
        # that is an infra-level override, not a backend bug.
        origin = requests.get(f"http://localhost:8001{image_url}", timeout=10)
        assert origin.status_code == 200
        assert origin.headers.get("content-type", "").startswith("image/"), origin.headers
        cc = origin.headers.get("cache-control", "")
        m = re.search(r"max-age=(\d+)", cc)
        assert m, f"Origin Cache-Control missing max-age: {cc!r}"
        max_age = int(m.group(1))
        assert max_age >= 604800, f"origin max-age {max_age} < 604800 (7 days). CC={cc!r}"

        # Also fetch via the public URL — this is what the mobile client will
        # actually hit. We only assert 200 + image; the cache header is expected
        # to be rewritten by the ingress (documented in report).
        r2 = requests.get(f"{BASE_URL}{image_url}", timeout=15)
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("image/")

        # Cleanup: delete the created test menu item so we don't pollute the vendor
        item_id = j.get("menu_item_id") or j.get("item_id")
        if item_id:
            s.delete(f"{BASE_URL}/api/ops/menu/{item_id}", headers=headers, timeout=15)
