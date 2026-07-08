"""Iteration 13: Ops CSV/XLSX menu import end-to-end.

Covers:
- POST /api/ops/menu-import/parse-file with CSV (veg/non-veg + contains_egg)
- POST /api/ops/menu-import/parse-file with XLSX (same schema)
- POST /api/ops/vendors/{vendor_id}/menu/bulk with parsed items -> persisted in menu list
- Auth: missing token -> 401/403; customer -> 403 (manage_menu required)
- Unsupported file type -> 400
- Cleanup created items
"""
import io
import os
import time
import uuid

import openpyxl
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("anubhavg@perfectlygood.in", "Anubhavv")
OPS = ("chaitanya@perfectlygood.in", "123456789")
VENDOR_ID = "dv_namma"

CSV_HEADER = "Item,Description,Original Price,Veg/Non-Veg,Contains Egg\n"
CSV_ROWS = [
    "TEST_Iter13_Paneer Tikka,Grilled paneer,220,Veg,No",
    "TEST_Iter13_Chicken 65,Fried spicy chicken,260,Non-Veg,No",
    "TEST_Iter13_Egg Curry,Egg gravy,150,Veg,Yes",
]
CSV_BODY = (CSV_HEADER + "\n".join(CSV_ROWS) + "\n").encode("utf-8")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_tok():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def ops_tok():
    return _login(*OPS)


# --- 1) CSV parse -> bulk-add -> verify persisted -> cleanup ---
class TestCsvImportRoundTrip:
    def test_admin_can_parse_and_bulk_add_csv(self, admin_tok):
        # Parse
        files = {"file": ("menu.csv", CSV_BODY, "text/csv")}
        r = requests.post(f"{API}/ops/menu-import/parse-file", files=files, headers=H(admin_tok), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] == 3
        items = data["items"]
        by_name = {i["name"]: i for i in items}
        assert by_name["TEST_Iter13_Paneer Tikka"]["food_type"] == "veg"
        assert by_name["TEST_Iter13_Paneer Tikka"]["contains_egg"] is False
        assert by_name["TEST_Iter13_Chicken 65"]["food_type"] == "non_veg"
        assert by_name["TEST_Iter13_Egg Curry"]["contains_egg"] is True
        assert by_name["TEST_Iter13_Egg Curry"]["original_price"] == 150

        # Bulk-add
        bulk = requests.post(
            f"{API}/ops/vendors/{VENDOR_ID}/menu/bulk",
            json={"items": items},
            headers=H(admin_tok),
            timeout=30,
        )
        assert bulk.status_code == 200, bulk.text
        assert bulk.json()["created"] == 3

        # Verify persisted via GET vendor menu
        vm = requests.get(f"{API}/ops/vendors/{VENDOR_ID}/menu", headers=H(admin_tok), timeout=15)
        assert vm.status_code == 200
        menu = vm.json()
        by_name_db = {m["name"]: m for m in menu if m["name"].startswith("TEST_Iter13_")}
        assert set(by_name_db.keys()) == {
            "TEST_Iter13_Paneer Tikka",
            "TEST_Iter13_Chicken 65",
            "TEST_Iter13_Egg Curry",
        }
        # Non-veg preserved
        assert by_name_db["TEST_Iter13_Chicken 65"]["food_type"] == "non_veg"
        # Egg preserved
        assert by_name_db["TEST_Iter13_Egg Curry"]["contains_egg"] is True

        # Cleanup created items
        for m in by_name_db.values():
            requests.delete(f"{API}/ops/menu/{m['menu_item_id']}", headers=H(admin_tok), timeout=15)


# --- 2) XLSX parse ---
class TestXlsxParse:
    def test_parse_xlsx(self, admin_tok):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["Item", "Description", "Original Price", "Veg/Non-Veg", "Contains Egg"])
        ws.append(["TEST_XLSX_Item1", "veg d", 100, "Veg", "No"])
        ws.append(["TEST_XLSX_Item2", "nv d", 200, "Non-Veg", "Yes"])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        files = {
            "file": (
                "menu.xlsx",
                buf.read(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        }
        r = requests.post(f"{API}/ops/menu-import/parse-file", files=files, headers=H(admin_tok), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["count"] == 2
        by = {i["name"]: i for i in d["items"]}
        assert by["TEST_XLSX_Item1"]["food_type"] == "veg"
        assert by["TEST_XLSX_Item1"]["contains_egg"] is False
        assert by["TEST_XLSX_Item2"]["food_type"] == "non_veg"
        assert by["TEST_XLSX_Item2"]["contains_egg"] is True
        assert by["TEST_XLSX_Item2"]["original_price"] == 200


# --- 3) Auth / RBAC ---
class TestParseFileAuth:
    def test_no_token_rejected(self):
        files = {"file": ("menu.csv", CSV_BODY, "text/csv")}
        r = requests.post(f"{API}/ops/menu-import/parse-file", files=files, timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text[:200]}"

    def test_ops_role_has_manage_menu(self, ops_tok):
        # Operations role should have manage_menu (per test_credentials.md: Ops uploads vendor menu)
        files = {"file": ("menu.csv", CSV_BODY, "text/csv")}
        r = requests.post(f"{API}/ops/menu-import/parse-file", files=files, headers=H(ops_tok), timeout=30)
        assert r.status_code == 200, f"ops should be allowed to parse-file: {r.status_code} {r.text[:200]}"
        assert r.json()["count"] == 3

    def test_customer_denied(self):
        email = f"TEST_perm_{uuid.uuid4().hex[:8]}@example.com"
        rr = requests.post(
            f"{API}/auth/register",
            json={
                "name": "TEST perm",
                "email": email,
                "password": "abc12345",
                "phone": "+911234567890",
                "role": "user",
            },
            timeout=15,
        )
        if rr.status_code not in (200, 201):
            pytest.skip(f"register skipped: {rr.status_code} {rr.text[:200]}")
        tok = rr.json().get("access_token") or _login(email, "abc12345")
        files = {"file": ("menu.csv", CSV_BODY, "text/csv")}
        r = requests.post(f"{API}/ops/menu-import/parse-file", files=files, headers=H(tok), timeout=15)
        assert r.status_code == 403


# --- 4) Unsupported file type ---
class TestParseFileBadType:
    def test_unsupported_extension(self, admin_tok):
        files = {"file": ("readme.txt", b"hello", "text/plain")}
        r = requests.post(f"{API}/ops/menu-import/parse-file", files=files, headers=H(admin_tok), timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"


# --- 5) Bulk-add filters invalid rows (missing name / non-positive price) ---
class TestBulkAddValidation:
    def test_invalid_rows_dropped(self, admin_tok):
        payload = {
            "items": [
                {"name": "TEST_Iter13_Valid", "original_price": 100, "food_type": "veg"},
                {"name": "", "original_price": 50},  # invalid: empty name
                {"name": "TEST_Iter13_NoPrice", "original_price": 0},  # invalid: 0 price
                {"name": "TEST_Iter13_NegPrice", "original_price": -5},  # invalid: negative
            ]
        }
        r = requests.post(
            f"{API}/ops/vendors/{VENDOR_ID}/menu/bulk",
            json=payload,
            headers=H(admin_tok),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["created"] == 1, r.json()

        # Cleanup: find TEST_Iter13_Valid
        vm = requests.get(f"{API}/ops/vendors/{VENDOR_ID}/menu", headers=H(admin_tok), timeout=15)
        for m in vm.json():
            if m["name"] == "TEST_Iter13_Valid":
                requests.delete(f"{API}/ops/menu/{m['menu_item_id']}", headers=H(admin_tok), timeout=15)
