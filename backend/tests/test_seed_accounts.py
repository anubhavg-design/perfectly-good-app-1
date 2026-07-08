"""
Tests for idempotent seed_data() staff account seeding on startup.
Verifies:
- All 5 seeded staff accounts authenticate via POST /api/auth/login
- Admin GET /api/auth/me returns role=admin + permissions
- Wrong password returns 401 (confirms 123456789 vs 123456)
- Operations cannot POST /api/ops/staff -> 403
- No duplicate accounts (idempotency)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://perfectly-good-build.preview.emergentagent.com").rstrip("/")

SEEDED = [
    ("anubhavg@perfectlygood.in", "Anubhavv", "admin"),
    ("chaitanya@perfectlygood.in", "123456789", "operations"),
    ("kavyashetty975@gmail.com", "123456789", "operations"),
    ("sas023261@gmail.com", "123456789", "operations"),
    ("subhashramachandraofficial@gmail.com", "123456789", "operations"),
]


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": SEEDED[0][0], "password": SEEDED[0][1]})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.mark.parametrize("email,password,role", SEEDED)
def test_seeded_login(api, email, password, role):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": email, "password": password})
    assert r.status_code == 200, f"{email} -> {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"token missing in {data}"
    assert "user" in data or data.get("email") == email, "user info missing"
    role_val = (data.get("user") or {}).get("role") or data.get("role")
    email_val = (data.get("user") or {}).get("email") or data.get("email")
    assert role_val == role, f"expected role {role}, got {role_val}"
    assert email_val == email


def test_admin_me_has_permissions(api, admin_token):
    r = api.get(f"{BASE_URL}/api/auth/me",
                headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("role") == "admin"
    perms = data.get("permissions")
    assert isinstance(perms, list) and len(perms) > 0, f"permissions empty: {perms}"
    # admin should have manage_roles capability
    assert "manage_roles" in perms, f"manage_roles missing from {perms}"


def test_wrong_password_401(api):
    # user typed 123456 (screenshot bug) — must be rejected
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": "kavyashetty975@gmail.com", "password": "123456"})
    assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"


def test_operations_cannot_create_staff(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": "chaitanya@perfectlygood.in", "password": "123456789"})
    assert r.status_code == 200
    ops_token = r.json()["access_token"]

    r2 = api.post(f"{BASE_URL}/api/ops/staff",
                  headers={"Authorization": f"Bearer {ops_token}"},
                  json={"name": "TEST_should_fail", "email": "TEST_x@x.com",
                        "password": "abcdef", "role": "operations"})
    assert r2.status_code == 403, f"operations should be 403, got {r2.status_code} {r2.text}"


def test_admin_can_list_staff_no_duplicates(api, admin_token):
    api.cookies.clear()
    r = api.get(f"{BASE_URL}/api/ops/staff",
                headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    staff = r.json()
    assert isinstance(staff, list)
    emails = [s.get("email", "").lower() for s in staff]
    for email, _, _ in SEEDED:
        assert emails.count(email) == 1, f"duplicate/missing for {email}: {emails.count(email)}"
