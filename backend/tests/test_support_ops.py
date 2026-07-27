"""Backend tests for Support Requests ops module + WhatsApp gating (Jan 2026)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://perfectly-good-build.preview.emergentagent.com").rstrip("/")

ADMIN = {"email": "anubhavg@perfectlygood.in", "password": "Anubhavv"}
OPS = {"email": "operations@perfectlygood.in", "password": "ops12345"}
FIN = {"email": "finance@perfectlygood.in", "password": "finance12345"}


def _login(email: str, password: str):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        return None, r
    tok = r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, r


@pytest.fixture(scope="module")
def admin_client():
    s, r = _login(ADMIN["email"], ADMIN["password"])
    if not s:
        pytest.skip(f"admin login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def ops_client():
    s, r = _login(OPS["email"], OPS["password"])
    if not s:
        pytest.skip(f"ops login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def finance_client():
    s, r = _login(FIN["email"], FIN["password"])
    if not s:
        pytest.skip(f"finance login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def customer_client():
    """Register a fresh customer + submit an 'other' ticket. Returns (session, ticket_id, payload)."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST Support Cust {suffix}",
        "email": f"test_sup_{suffix}@example.com",
        "phone": "+919000000000",
        "password": "TestPass123",
    }
    r = s.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code == 200, f"register failed: {r.text}"
    tok = r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {tok}"})

    r = s.post(f"{BASE_URL}/api/support/requests", json={
        "issue_type": "other", "message": "TEST support ops ticket"
    })
    assert r.status_code == 200, f"submit failed: {r.text}"
    ticket_id = r.json()["support_id"]
    return s, ticket_id, payload


# ─── RBAC on GET /api/ops/support-requests ───────────────────────────────
class TestListRBAC:
    def test_admin_can_list(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/ops/support-requests")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d and "total" in d
        assert isinstance(d["items"], list)

    def test_operations_can_list(self, ops_client):
        r = ops_client.get(f"{BASE_URL}/api/ops/support-requests")
        assert r.status_code == 200, r.text
        assert "items" in r.json()

    def test_finance_forbidden(self, finance_client):
        r = finance_client.get(f"{BASE_URL}/api/ops/support-requests")
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"

    def test_unauthenticated_401(self):
        r = requests.get(f"{BASE_URL}/api/ops/support-requests")
        assert r.status_code == 401


# ─── List behaviour: newest-first, filter by issue_type / status ─────────
class TestListBehaviour:
    def test_newest_first(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/ops/support-requests?page_size=10")
        assert r.status_code == 200
        items = r.json()["items"]
        if len(items) >= 2:
            ts = [i.get("created_at") for i in items if i.get("created_at")]
            assert ts == sorted(ts, reverse=True), "list is not sorted newest-first"

    def test_photo_omitted_from_list(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/ops/support-requests?page_size=20")
        for it in r.json()["items"]:
            assert "photo_base64" not in it, "list must omit photo_base64"

    def test_filter_by_issue_type(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/ops/support-requests?issue_type=other&page_size=50")
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["issue_type"] == "other"

    def test_filter_by_status_open(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/ops/support-requests?status=open&page_size=50")
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["status"] == "open"


# ─── Detail returns photo_base64 ────────────────────────────────────────
class TestDetail:
    def test_detail_returns_photo_and_shape(self, admin_client, customer_client):
        s, _, cust = customer_client
        b64 = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
        # Submit a wrong_item ticket with photo
        r = s.post(f"{BASE_URL}/api/support/requests", json={
            "issue_type": "wrong_item", "message": "TEST photo", "photo_base64": b64
        })
        assert r.status_code == 200
        tid = r.json()["support_id"]

        r = admin_client.get(f"{BASE_URL}/api/ops/support-requests/{tid}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["support_id"] == tid
        assert d.get("photo_base64") == b64
        assert d["issue_type"] == "wrong_item"
        assert d["status"] == "open"
        assert d.get("whatsapp_enabled") is False
        assert "_id" not in d

    def test_detail_404_unknown(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/ops/support-requests/support_does_not_exist")
        assert r.status_code == 404

    def test_detail_forbidden_finance(self, finance_client, customer_client):
        _, tid, _ = customer_client
        r = finance_client.get(f"{BASE_URL}/api/ops/support-requests/{tid}")
        assert r.status_code == 403


# ─── PUT /resolve and /whatsapp ─────────────────────────────────────────
class TestActions:
    def test_enable_whatsapp_and_customer_sees_it(self, admin_client, customer_client):
        s, tid, _ = customer_client

        # Before enable: customer's my-requests shows whatsapp_enabled=False
        r = s.get(f"{BASE_URL}/api/support/my-requests")
        assert r.status_code == 200
        rows = {x["support_id"]: x for x in r.json()}
        assert tid in rows
        assert rows[tid]["whatsapp_enabled"] is False
        assert rows[tid]["status"] == "open"

        # Enable whatsapp
        r = admin_client.put(f"{BASE_URL}/api/ops/support-requests/{tid}/whatsapp")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["whatsapp_enabled"] is True

        # Verify in ops detail
        r = admin_client.get(f"{BASE_URL}/api/ops/support-requests/{tid}")
        assert r.status_code == 200
        d = r.json()
        assert d["whatsapp_enabled"] is True
        assert d.get("whatsapp_enabled_by")
        assert d.get("whatsapp_enabled_at")

        # Customer now sees it
        r = s.get(f"{BASE_URL}/api/support/my-requests")
        rows = {x["support_id"]: x for x in r.json()}
        assert rows[tid]["whatsapp_enabled"] is True

    def test_mark_resolved(self, admin_client, customer_client):
        _, tid, _ = customer_client
        r = admin_client.put(f"{BASE_URL}/api/ops/support-requests/{tid}/resolve")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "resolved"

        # Verify in detail
        r = admin_client.get(f"{BASE_URL}/api/ops/support-requests/{tid}")
        d = r.json()
        assert d["status"] == "resolved"
        assert d.get("resolved_by")
        assert d.get("resolved_at")

    def test_resolve_forbidden_finance(self, finance_client, customer_client):
        _, tid, _ = customer_client
        r = finance_client.put(f"{BASE_URL}/api/ops/support-requests/{tid}/resolve")
        assert r.status_code == 403

    def test_whatsapp_forbidden_finance(self, finance_client, customer_client):
        _, tid, _ = customer_client
        r = finance_client.put(f"{BASE_URL}/api/ops/support-requests/{tid}/whatsapp")
        assert r.status_code == 403

    def test_resolve_404_unknown(self, admin_client):
        r = admin_client.put(f"{BASE_URL}/api/ops/support-requests/support_missing_x/resolve")
        assert r.status_code == 404

    def test_whatsapp_404_unknown(self, admin_client):
        r = admin_client.put(f"{BASE_URL}/api/ops/support-requests/support_missing_x/whatsapp")
        assert r.status_code == 404


# ─── /api/support/my-requests shape ─────────────────────────────────────
class TestCustomerMyRequests:
    def test_my_requests_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/support/my-requests")
        assert r.status_code == 401

    def test_shape(self, customer_client):
        s, _, _ = customer_client
        r = s.get(f"{BASE_URL}/api/support/my-requests")
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        if arr:
            it = arr[0]
            for k in ("support_id", "issue_type", "status", "whatsapp_enabled", "created_at"):
                assert k in it
            assert "photo_base64" not in it, "photo should not be exposed here (customer view)"
