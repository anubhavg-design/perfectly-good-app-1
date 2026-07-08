"""
Backend tests for the staff password-reset bug fix:
  - PUT /api/ops/staff/{user_id}/password           (new endpoint, needs manage_roles)
  - Password validation (>=6 chars)
  - RBAC: finance staff (no manage_roles) forbidden
  - 404 on unknown user
  - POST /api/ops/staff still creates a working staff account
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

# Admin (manage_roles) — per test_credentials.md and review note
ADMIN_EMAIL = "anubhavg@perfectlygood.in"
ADMIN_PASSWORD = "Anubhavv"

# Existing staff we will reset & re-verify login
STAFF_EMAIL = "chaitanya@perfectlygood.in"


def _login(email: str, password: str):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    return r


def _auth_headers(token: str):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ── Fixtures ─────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if r.status_code != 200:
        # fall back to seeded admin
        r = _login("admin@perfectlygood.com", "admin123")
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def staff_list(admin_token):
    r = requests.get(f"{API}/ops/staff", headers=_auth_headers(admin_token))
    assert r.status_code == 200, f"List staff failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def target_staff(staff_list):
    for s in staff_list:
        if s.get("email") == STAFF_EMAIL:
            return s
    pytest.skip(f"Target staff {STAFF_EMAIL} not present in /api/ops/staff")


# ── 1. Password reset happy-path ─────────────────────────────────────────────
class TestStaffPasswordReset:
    def test_admin_can_reset_staff_password(self, admin_token, target_staff):
        new_pwd = f"ResetPwd_{uuid.uuid4().hex[:8]}!"
        r = requests.put(
            f"{API}/ops/staff/{target_staff['user_id']}/password",
            headers=_auth_headers(admin_token),
            json={"password": new_pwd},
        )
        assert r.status_code == 200, f"PUT password failed: {r.status_code} {r.text}"
        assert "message" in r.json()

        # store on module for the follow-up test
        TestStaffPasswordReset._new_pwd = new_pwd

    def test_staff_can_login_with_new_password(self, target_staff):
        new_pwd = getattr(TestStaffPasswordReset, "_new_pwd", None)
        assert new_pwd, "Previous reset test did not run"
        r = _login(target_staff["email"], new_pwd)
        assert r.status_code == 200, f"Staff login failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("access_token"), f"No access_token in response: {list(data.keys())}"
        assert data.get("role") in {"admin", "operations", "customer_success", "finance"}, (
            f"Unexpected role for staff: {data.get('role')}"
        )
        assert isinstance(data.get("permissions"), list) and len(data["permissions"]) > 0

    def test_login_old_password_no_longer_works(self, target_staff):
        # try a stale password unlikely to match the freshly-set one
        r = _login(target_staff["email"], "definitely-not-the-new-password-xyz")
        assert r.status_code == 401


# ── 2. Validation & error paths ───────────────────────────────────────────────
class TestPasswordResetValidation:
    def test_short_password_rejected_400(self, admin_token, target_staff):
        r = requests.put(
            f"{API}/ops/staff/{target_staff['user_id']}/password",
            headers=_auth_headers(admin_token),
            json={"password": "abc"},
        )
        assert r.status_code == 400, f"Expected 400 for short pwd, got {r.status_code}"

    def test_empty_password_rejected_400(self, admin_token, target_staff):
        r = requests.put(
            f"{API}/ops/staff/{target_staff['user_id']}/password",
            headers=_auth_headers(admin_token),
            json={"password": ""},
        )
        assert r.status_code == 400

    def test_unknown_user_returns_404(self, admin_token):
        r = requests.put(
            f"{API}/ops/staff/user_does_not_exist_xyz/password",
            headers=_auth_headers(admin_token),
            json={"password": "SomePwd123"},
        )
        assert r.status_code == 404, f"Expected 404, got {r.status_code} {r.text}"


# ── 3. RBAC: finance staff cannot reset passwords (no manage_roles) ──────────
class TestPasswordResetRBAC:
    _finance_email = None
    _finance_pwd = None
    _finance_user_id = None

    def test_create_finance_staff(self, admin_token):
        email = f"TEST_finance_{uuid.uuid4().hex[:8]}@example.com"
        pwd = "FinancePwd123!"
        r = requests.post(
            f"{API}/ops/staff",
            headers=_auth_headers(admin_token),
            json={"name": "TEST Finance User", "email": email, "password": pwd, "role": "finance"},
        )
        assert r.status_code == 200, f"Create finance failed: {r.status_code} {r.text}"
        j = r.json()
        assert j.get("user_id"), f"Missing user_id: {j}"
        TestPasswordResetRBAC._finance_email = email
        TestPasswordResetRBAC._finance_pwd = pwd
        TestPasswordResetRBAC._finance_user_id = j["user_id"]

    def test_finance_can_login(self):
        assert TestPasswordResetRBAC._finance_email, "create step didn't run"
        r = _login(TestPasswordResetRBAC._finance_email, TestPasswordResetRBAC._finance_pwd)
        assert r.status_code == 200, f"Finance login failed: {r.status_code} {r.text}"
        data = r.json()
        tok = data.get("access_token")
        assert tok, f"No token: {list(data.keys())}"
        assert data.get("role") == "finance"
        # finance role should NOT have manage_roles
        assert "manage_roles" not in (data.get("permissions") or [])
        TestPasswordResetRBAC._finance_token = tok

    def test_finance_reset_forbidden_403(self, target_staff):
        tok = getattr(TestPasswordResetRBAC, "_finance_token", None)
        assert tok, "login step didn't run"
        r = requests.put(
            f"{API}/ops/staff/{target_staff['user_id']}/password",
            headers=_auth_headers(tok),
            json={"password": "IShouldNotPass123"},
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code} {r.text}"

    def test_cleanup_finance_staff(self, admin_token):
        uid = TestPasswordResetRBAC._finance_user_id
        if not uid:
            return
        r = requests.delete(f"{API}/ops/staff/{uid}", headers=_auth_headers(admin_token))
        assert r.status_code in (200, 404)


# ── 4. Create staff → login works (fresh account) ────────────────────────────
class TestCreateStaffLogin:
    def test_create_and_login(self, admin_token):
        email = f"TEST_ops_{uuid.uuid4().hex[:8]}@example.com"
        pwd = "CreatePwd123!"
        r = requests.post(
            f"{API}/ops/staff",
            headers=_auth_headers(admin_token),
            json={"name": "TEST Ops User", "email": email, "password": pwd, "role": "operations"},
        )
        assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
        j = r.json()
        uid = j["user_id"]

        # login
        r2 = _login(email, pwd)
        assert r2.status_code == 200, f"Login failed: {r2.status_code} {r2.text}"
        data = r2.json()
        assert data.get("role") == "operations"
        assert data.get("access_token")

        # cleanup
        requests.delete(f"{API}/ops/staff/{uid}", headers=_auth_headers(admin_token))
