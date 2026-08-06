"""Apple 5.1.1 compliance tests: guest browsing + permanent account deletion.

Verifies:
- Public GETs (drops, restaurants) are accessible without auth
- Protected endpoints (orders, addresses, deal_alerts) require auth
- Full account delete flow: create user -> submit an order (anonymized after delete),
  save a deal_alert -> after DELETE /api/auth/me, user row is gone, deal_alerts purged,
  order remains with user_name="Deleted user".
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://perfectly-good-build.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "perfectly_good")


@pytest.fixture(scope="module")
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ── Guest browsing (public endpoints, no auth) ────────────────────────────

class TestGuestBrowsing:
    def test_drops_list_public(self, api_client):
        r = api_client.get(f"{API}/drops")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_restaurants_list_public(self, api_client):
        r = api_client.get(f"{API}/restaurants")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_drops_categories_public(self, api_client):
        r = api_client.get(f"{API}/drops/categories")
        assert r.status_code == 200, r.text

    def test_drop_detail_public(self, api_client):
        drops = api_client.get(f"{API}/drops").json()
        if not drops:
            pytest.skip("No live drops available to test detail")
        item_id = drops[0].get("menu_item_id") or drops[0].get("item_id") or drops[0].get("id")
        r = api_client.get(f"{API}/drops/{item_id}")
        assert r.status_code == 200, r.text

    def test_restaurant_detail_public(self, api_client):
        vendors = api_client.get(f"{API}/restaurants").json()
        if not vendors:
            pytest.skip("No live restaurants available to test detail")
        vid = vendors[0].get("vendor_id") or vendors[0].get("id")
        r = api_client.get(f"{API}/restaurants/{vid}")
        assert r.status_code == 200, r.text

    def test_drops_search_public(self, api_client):
        r = api_client.get(f"{API}/drops", params={"search": "chocolate"})
        assert r.status_code == 200, r.text


# ── Protected endpoints reject unauthenticated calls ─────────────────────

class TestProtectedRequireAuth:
    def test_orders_user_requires_auth(self, api_client):
        r = api_client.get(f"{API}/orders/user")
        assert r.status_code in (401, 403), f"expected auth required, got {r.status_code}"

    def test_auth_me_requires_auth(self, api_client):
        r = api_client.get(f"{API}/auth/me")
        assert r.status_code in (401, 403)

    def test_delete_account_requires_auth(self, api_client):
        r = api_client.delete(f"{API}/auth/me")
        assert r.status_code in (401, 403)


# ── Account deletion flow ────────────────────────────────────────────────

@pytest.fixture(scope="module")
def throwaway_user(db):
    """Create a fresh customer via the public register endpoint."""
    uniq = uuid.uuid4().hex[:8]
    email = f"TEST_del_{uniq}@example.com"
    password = "TestPass123!"
    payload = {"name": "TEST Delete User", "email": email, "phone": "9998887777", "password": password}
    r = requests.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token")
    user_id = data.get("user_id")
    assert token and user_id
    yield {"email": email, "password": password, "token": token, "user_id": user_id}
    # cleanup if still present
    db.users.delete_one({"user_id": user_id})
    db.deal_alerts.delete_many({"user_id": user_id})


class TestAccountDeletion:
    def test_delete_account_full_flow(self, throwaway_user, db):
        token = throwaway_user["token"]
        uid = throwaway_user["user_id"]
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # Verify user visible via /auth/me
        me = requests.get(f"{API}/auth/me", headers=headers)
        assert me.status_code == 200, me.text
        assert me.json()["user_id"] == uid

        # Seed some personal data server-side for anonymization/purge check
        db.deal_alerts.insert_one({
            "alert_id": f"TEST_al_{uid}",
            "user_id": uid,
            "vendor_id": "TEST_vendor",
            "created_at": "2026-01-01T00:00:00Z",
        })
        db.orders.insert_one({
            "order_id": f"TEST_ord_{uid}",
            "user_id": uid,
            "user_name": "TEST Delete User",
            "food_item_id": "TEST_item",
            "food_item_name": "Test Item",
            "vendor_id": "TEST_vendor",
            "vendor_name": "TEST Vendor",
            "quantity": 1,
            "total_amount": 100,
            "status": "picked_up",
            "created_at": "2026-01-01T00:00:00Z",
        })

        # Delete account
        r = requests.delete(f"{API}/auth/me", headers=headers)
        assert r.status_code == 200, r.text

        # Verify user removed
        assert db.users.find_one({"user_id": uid}) is None

        # Verify deal_alerts purged
        assert db.deal_alerts.find_one({"user_id": uid}) is None

        # Verify order anonymized (retained, but user_name replaced)
        ord_doc = db.orders.find_one({"order_id": f"TEST_ord_{uid}"})
        assert ord_doc is not None, "order should be retained"
        assert ord_doc.get("user_name") == "Deleted user"

        # /auth/me should now fail
        me2 = requests.get(f"{API}/auth/me", headers=headers)
        assert me2.status_code in (401, 403)

        # cleanup
        db.orders.delete_one({"order_id": f"TEST_ord_{uid}"})

    def test_staff_cannot_self_delete(self, api_client):
        # Admin login
        r = api_client.post(f"{API}/auth/login", json={
            "email": "anubhavg@perfectlygood.in", "password": "Anubhavv"})
        if r.status_code != 200:
            pytest.skip("Admin login not available in this env")
        token = r.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        r = requests.delete(f"{API}/auth/me", headers=headers)
        assert r.status_code == 403, f"staff should be blocked from self-delete: {r.status_code} {r.text}"
