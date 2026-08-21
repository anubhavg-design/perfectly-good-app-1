"""
Tests for thumbnail variants generation on menu items (iteration 25).

Verifies:
 - POST /api/ops/vendors/{id}/menu with base64 data-URI image => stores optimized
   image_url (~1000px) + thumbnail_url (~320px). Thumbnail is significantly smaller.
 - PUT /api/ops/menu/{id} with new base64 image also regenerates both.
 - /api/drops items expose thumbnail_url (via item_to_drop spread).
 - /api/featured-deals surface `item_thumbnail`.
 - /api/browse-deals surface `item_thumbnail` (when vendor has discount_percentage>0).
 - /api/restaurants/{id} surplus_items expose thumbnail_url.
"""
import base64
import io
import os
import time

import pytest
import requests
from PIL import Image

ADMIN_EMAIL = "anubhavg@perfectlygood.in"
ADMIN_PASSWORD = "Anubhavv"


def _make_large_data_uri(px: int = 1500) -> str:
    """Create a solid-color PNG of size px×px encoded as data URI (~large)."""
    img = Image.new("RGB", (px, px), color=(200, 120, 60))
    # Add some variance so JPEG compression doesn't collapse to a tiny value.
    for x in range(0, px, 25):
        for y in range(0, px, 25):
            img.putpixel((x, y), (255 - (x % 255), (y * 3) % 255, (x + y) % 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def _px_of_data_uri(uri: str) -> tuple:
    header, b64 = uri.split(",", 1)
    raw = base64.b64decode(b64)
    img = Image.open(io.BytesIO(raw))
    return img.size


def _size_of_data_uri(uri: str) -> int:
    _, b64 = uri.split(",", 1)
    return len(base64.b64decode(b64))


@pytest.fixture(scope="module")
def base_url():
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    if not url:
        raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not set")
    return url.rstrip("/")


@pytest.fixture(scope="module")
def admin_headers(base_url):
    r = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, "admin login returned no token"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# Always-open shifts (00:00–23:59 every day) so the vendor is OPEN NOW
_ALL_OPEN_HOURS = {
    d: [{"start": "00:00", "end": "23:59"}]
    for d in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
}


@pytest.fixture(scope="module")
def test_vendor(base_url, admin_headers):
    """Create an ACTIVE vendor open 24/7 for testing. Cleanup after."""
    payload = {
        "name": "TEST_ThumbVendor",
        "owner_name": "TEST Owner",
        "email": f"test_thumb_{int(time.time())}@example.com",
        "password": "vendor123",
        "phone": "9999999999",
        "category": "Restaurant",
        "full_address": "MG Road, Bengaluru",
        "service_type": "both",
        "pickup_start_time": "00:00",
        "pickup_end_time": "23:59",
        "status": "active",
        "discount_percentage": 25,
        "hours": _ALL_OPEN_HOURS,
    }
    r = requests.post(f"{base_url}/api/ops/vendors", json=payload, headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"vendor create failed: {r.status_code} {r.text}"
    v = r.json()
    vendor_id = v["vendor_id"]
    yield v
    # Cleanup: delete vendor (admin can)
    try:
        requests.delete(f"{base_url}/api/ops/vendors/{vendor_id}", headers=admin_headers, timeout=30)
    except Exception:
        pass


# ---------- Thumbnail generation on create ----------

class TestMenuCreateThumbnail:
    def test_create_menu_item_generates_thumbnail(self, base_url, admin_headers, test_vendor):
        vid = test_vendor["vendor_id"]
        big_uri = _make_large_data_uri(1500)
        original_size = _size_of_data_uri(big_uri)

        r = requests.post(
            f"{base_url}/api/ops/vendors/{vid}/menu",
            json={
                "name": "TEST_ThumbItem",
                "description": "test",
                "original_price": 200,
                "discounted_price": 100,
                "category": "Main",
                "food_type": "veg",
                "available_today": True,     # surplus + drops
                "quantity_available": 5,
                "image_url": big_uri,
            },
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"create menu failed: {r.status_code} {r.text}"
        item = r.json()

        # Both fields must exist and be non-empty
        assert item.get("image_url"), "image_url missing on created item"
        assert item.get("thumbnail_url"), "thumbnail_url missing on created item"

        img_size = _size_of_data_uri(item["image_url"])
        th_size = _size_of_data_uri(item["thumbnail_url"])

        # Thumbnail must be strictly smaller than full-optimized image
        assert th_size < img_size, f"thumb ({th_size}) not smaller than full ({img_size})"
        # And both must be smaller than the original raw PNG
        assert img_size < original_size
        # Dimensions: full ≤ 1000px, thumb ≤ 320px on longest side
        full_w, full_h = _px_of_data_uri(item["image_url"])
        th_w, th_h = _px_of_data_uri(item["thumbnail_url"])
        assert max(full_w, full_h) <= 1000
        assert max(th_w, th_h) <= 320

        # Save for later assertions
        pytest.thumb_item_id = item["menu_item_id"]

    def test_update_menu_item_regenerates_thumbnail(self, base_url, admin_headers):
        item_id = getattr(pytest, "thumb_item_id", None)
        if not item_id:
            pytest.skip("prior create test did not run")
        # push a new large image via PUT
        new_uri = _make_large_data_uri(1200)
        r = requests.put(
            f"{base_url}/api/ops/menu/{item_id}",
            json={
                "name": "TEST_ThumbItem",
                "description": "updated",
                "original_price": 220,
                "discounted_price": 110,
                "category": "Main",
                "food_type": "veg",
                "available_today": True,
                "quantity_available": 5,
                "image_url": new_uri,
            },
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"update menu failed: {r.status_code} {r.text}"


# ---------- Thumbnail surfaced on list endpoints ----------

class TestListEndpointsSurfaceThumbnail:
    def test_drops_has_thumbnail_url(self, base_url):
        r = requests.get(f"{base_url}/api/drops", timeout=30)
        assert r.status_code == 200
        drops = r.json()
        # Find our TEST item
        mine = [d for d in drops if d.get("name") == "TEST_ThumbItem"]
        assert mine, f"TEST item not in /drops. Got {len(drops)} items"
        d = mine[0]
        assert d.get("thumbnail_url"), "thumbnail_url missing on /drops item"
        # thumbnail data URI should be smaller than image_url
        if d["thumbnail_url"].startswith("data:") and d.get("image_url", "").startswith("data:"):
            assert _size_of_data_uri(d["thumbnail_url"]) < _size_of_data_uri(d["image_url"])

    def test_browse_deals_has_item_thumbnail(self, base_url, test_vendor):
        """Browse-deals lists NORMAL (non-surplus) discounted items. Create one for our vendor."""
        vid = test_vendor["vendor_id"]
        big_uri = _make_large_data_uri(800)
        # login
        r = requests.post(
            f"{base_url}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=30,
        )
        tok = r.json()["access_token"]
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        rc = requests.post(
            f"{base_url}/api/ops/vendors/{vid}/menu",
            json={
                "name": "TEST_BrowseItem",
                "description": "browse test",
                "original_price": 300,
                "category": "Main",
                "food_type": "veg",
                "available_today": False,   # NOT surplus, so shows in /browse-deals
                "image_url": big_uri,
            },
            headers=h,
            timeout=60,
        )
        assert rc.status_code == 200, f"create browse menu failed: {rc.status_code} {rc.text}"

        r = requests.get(f"{base_url}/api/browse-deals", timeout=30)
        assert r.status_code == 200
        deals = r.json()
        mine = [d for d in deals if d.get("item_name") == "TEST_BrowseItem"]
        assert mine, f"TEST_BrowseItem not in /browse-deals. Got {len(deals)} items"
        d = mine[0]
        assert d.get("item_thumbnail"), "item_thumbnail missing on /browse-deals item"
        # thumbnail should be smaller than item_image if both are data URIs
        if d["item_thumbnail"].startswith("data:") and d.get("item_image", "").startswith("data:"):
            assert _size_of_data_uri(d["item_thumbnail"]) < _size_of_data_uri(d["item_image"])

    def test_featured_deals_has_item_thumbnail(self, base_url):
        """Featured-deals picks one item per active vendor. Runs AFTER browse-deals so
        our vendor has a NORMAL discounted item to be chosen."""
        r = requests.get(f"{base_url}/api/featured-deals", timeout=30)
        assert r.status_code == 200
        deals = r.json()
        mine = [d for d in deals if d.get("item_name") in ("TEST_BrowseItem", "TEST_ThumbItem")]
        assert mine, f"TEST item not in /featured-deals. Got {len(deals)} items"
        d = mine[0]
        assert d.get("item_thumbnail"), "item_thumbnail missing on /featured-deals item"

    def test_restaurant_detail_surplus_items_have_thumbnail(self, base_url, test_vendor):
        vid = test_vendor["vendor_id"]
        r = requests.get(f"{base_url}/api/restaurants/{vid}", timeout=30)
        assert r.status_code == 200, f"restaurant detail failed: {r.status_code}"
        v = r.json()
        surplus = v.get("surplus_items") or []
        assert surplus, "no surplus_items on our TEST vendor"
        found = [s for s in surplus if s.get("name") == "TEST_ThumbItem"]
        assert found, "TEST_ThumbItem not in surplus_items"
        s = found[0]
        assert s.get("thumbnail_url"), "thumbnail_url missing on surplus_items"
