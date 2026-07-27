"""Backend tests for the Help & Support endpoints."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if "EXPO_PUBLIC_BACKEND_URL" in os.environ else "https://perfectly-good-build.preview.emergentagent.com"


@pytest.fixture(scope="module")
def customer_client():
    """Register a fresh customer and return an authenticated requests session."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST Support User {suffix}",
        "email": f"test_support_{suffix}@example.com",
        "phone": "+919000000000",
        "password": "TestPass123",
    }
    r = s.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    s.cookies.clear()  # rely on bearer
    return s, payload


# ── /api/support/context ────────────────────────────────────────────────
class TestSupportContext:
    def test_context_shape_no_order(self, customer_client):
        s, payload = customer_client
        r = s.get(f"{BASE_URL}/api/support/context")
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("customer_name", "phone", "order_id", "restaurant_name",
                  "order_amount", "pickup_datetime", "has_order"):
            assert k in data, f"missing key {k}"
        assert data["customer_name"] == payload["name"]
        assert data["phone"] == payload["phone"]
        # Fresh user should have no order today
        assert data["has_order"] is False
        assert data["order_id"] is None

    def test_context_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/support/context")
        assert r.status_code == 401


# ── /api/support/requests ───────────────────────────────────────────────
class TestSupportRequests:
    def test_submit_other_ok(self, customer_client):
        s, _ = customer_client
        r = s.post(f"{BASE_URL}/api/support/requests", json={
            "issue_type": "other", "message": "TEST general query"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("support_id", "").startswith("support_")
        assert data.get("email_sent") is False  # placeholder SMTP
        assert "submitted" in data.get("message", "").lower()

    def test_submit_app_bug_ok(self, customer_client):
        s, _ = customer_client
        r = s.post(f"{BASE_URL}/api/support/requests", json={
            "issue_type": "app_bug",
            "message": "TEST bug",
            "device_model": "iPhone 14",
            "app_version": "1.0.0",
            "what_happened": "Crash on tap",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["support_id"].startswith("support_")
        assert d["email_sent"] is False

    def test_wrong_item_without_photo_400(self, customer_client):
        s, _ = customer_client
        r = s.post(f"{BASE_URL}/api/support/requests", json={
            "issue_type": "wrong_item", "message": "TEST no photo"
        })
        assert r.status_code == 400, r.text
        detail = r.json().get("detail", "")
        assert "photo" in detail.lower()

    def test_wrong_item_with_photo_ok(self, customer_client):
        s, _ = customer_client
        # 1x1 transparent gif as base64
        b64 = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
        r = s.post(f"{BASE_URL}/api/support/requests", json={
            "issue_type": "wrong_item", "message": "TEST with photo",
            "photo_base64": b64,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["support_id"].startswith("support_")
        assert d["email_sent"] is False

    def test_invalid_issue_type_400(self, customer_client):
        s, _ = customer_client
        r = s.post(f"{BASE_URL}/api/support/requests", json={
            "issue_type": "not_a_real_type", "message": "TEST"
        })
        assert r.status_code == 400, r.text
        assert "invalid" in r.json().get("detail", "").lower()

    def test_all_valid_issue_types_accepted(self, customer_client):
        s, _ = customer_client
        for t in ("refund", "order_cancelled", "restaurant_closed",
                  "payment_issue", "pickup_expired"):
            r = s.post(f"{BASE_URL}/api/support/requests",
                       json={"issue_type": t, "message": f"TEST {t}"})
            assert r.status_code == 200, f"{t}: {r.status_code} {r.text}"

    def test_submit_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/support/requests",
                          json={"issue_type": "other", "message": "x"})
        assert r.status_code == 401
