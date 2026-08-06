"""Backend tests for Ops bulk image upload endpoint.

Covers:
- Admin can upload for any vendor; matches by name (case-insensitive), updates only image_url
- Non-image files inside the ZIP are skipped with reason "Not an image file"
- Filenames with no matching menu item are skipped with reason "No matching menu item"
- Invalid (non-ZIP) upload returns 400 with the expected detail
- RBAC: operations role gets 403 on a vendor not assigned to them; success once assigned
- Only image_url + updated_at change on matched items — name/price/description untouched, no new items created
"""

import io
import os
import struct
import zlib
import zipfile

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
VENDOR_ID = "dv_namma"

ADMIN_EMAIL = "anubhavg@perfectlygood.in"
ADMIN_PASSWORD = "Anubhavv"
OPS_EMAIL = "chaitanya@perfectlygood.in"
OPS_PASSWORD = "123456789"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def ops_token():
    return _login(OPS_EMAIL, OPS_PASSWORD)


@pytest.fixture(scope="module")
def ops_user_id(ops_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {ops_token}"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["user_id"]


def _tiny_png() -> bytes:
    """Return the smallest valid 1x1 PNG (transparent)."""
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)  # 1x1, 8-bit RGBA
    idat_raw = b"\x00" + b"\x00\x00\x00\x00"  # filter + one RGBA pixel
    idat = zlib.compress(idat_raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def _make_zip(entries: dict[str, bytes]) -> bytes:
    """Build an in-memory ZIP with the given filename -> bytes mapping."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


def _upload(token: str, vendor_id: str, zip_bytes: bytes, filename: str = "images.zip"):
    return requests.post(
        f"{BASE_URL}/api/ops/vendors/{vendor_id}/bulk-images",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": (filename, zip_bytes, "application/zip")},
        timeout=60,
    )


def _get_menu(token: str, vendor_id: str):
    r = requests.get(
        f"{BASE_URL}/api/ops/vendors/{vendor_id}/menu",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()


# --- Admin: happy path (case-insensitive match + only image updated) ---
class TestAdminHappyPath:
    def test_admin_upload_matches_and_updates_only_image(self, admin_token):
        before = _get_menu(admin_token, VENDOR_ID)
        names = [i["name"] for i in before]
        assert "Masala Dosa" in names and "Filter Coffee" in names

        by_name = {i["name"]: i for i in before}
        png = _tiny_png()
        zip_bytes = _make_zip({
            # mixed casing on purpose to confirm case-insensitive matching
            "masala DOSA.png": png,
            "Filter Coffee.PNG": png,
            "does_not_exist.png": png,   # skipped: no match
            "notes.txt": b"hello",       # skipped: not image
        })
        r = _upload(admin_token, VENDOR_ID, zip_bytes)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total_images"] == 4
        assert body["updated_count"] == 2
        matched_names = {m["item_name"] for m in body["matched"]}
        assert matched_names == {"Masala Dosa", "Filter Coffee"}
        skipped_reasons = {(s["filename"], s["reason"]) for s in body["skipped"]}
        assert ("does_not_exist.png", "No matching menu item") in skipped_reasons
        assert ("notes.txt", "Not an image file") in skipped_reasons

        # GET to verify persistence + verify ONLY image_url changed on matched items
        after = _get_menu(admin_token, VENDOR_ID)
        assert len(after) == len(before), "No new items should be created"
        after_by_name = {i["name"]: i for i in after}
        for nm in ("Masala Dosa", "Filter Coffee"):
            b, a = by_name[nm], after_by_name[nm]
            assert a["image_url"].startswith("data:image/png;base64,"), f"{nm} image_url not updated to base64 data URI"
            assert a["original_price"] == b["original_price"], f"{nm} original_price changed"
            assert a["discounted_price"] == b["discounted_price"], f"{nm} discounted_price changed"
            assert a["description"] == b["description"], f"{nm} description changed"
            assert a["name"] == b["name"], f"{nm} name changed"
            assert a["menu_item_id"] == b["menu_item_id"]
        # untouched items keep their prior image_url
        for nm in ("Idli Vada Combo", "Ghee Pongal"):
            assert after_by_name[nm].get("image_url") == by_name[nm].get("image_url"), f"{nm} image should be untouched"

    def test_only_non_image_file_all_skipped(self, admin_token):
        zip_bytes = _make_zip({"readme.txt": b"nothing", "notes.md": b"more"})
        r = _upload(admin_token, VENDOR_ID, zip_bytes)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["updated_count"] == 0
        assert body["total_images"] == 2
        assert all(s["reason"] == "Not an image file" for s in body["skipped"])

    def test_only_unknown_names_all_skipped(self, admin_token):
        png = _tiny_png()
        zip_bytes = _make_zip({"unknown1.png": png, "unknown2.jpg": png})
        r = _upload(admin_token, VENDOR_ID, zip_bytes)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["updated_count"] == 0
        assert body["total_images"] == 2
        assert all(s["reason"] == "No matching menu item" for s in body["skipped"])


# --- Validation ---
class TestValidation:
    def test_invalid_zip_returns_400(self, admin_token):
        r = _upload(admin_token, VENDOR_ID, b"this is definitely not a zip file", filename="fake.zip")
        assert r.status_code == 400, r.text
        assert "not a valid ZIP" in r.json().get("detail", "")

    def test_unknown_vendor_returns_404(self, admin_token):
        png = _tiny_png()
        r = _upload(admin_token, "vendor_does_not_exist_xyz", _make_zip({"a.png": png}))
        assert r.status_code == 404, r.text

    def test_unauthenticated_rejected(self):
        # Missing bearer token → 401 or 403 depending on stack
        r = requests.post(
            f"{BASE_URL}/api/ops/vendors/{VENDOR_ID}/bulk-images",
            files={"file": ("x.zip", b"", "application/zip")},
            timeout=30,
        )
        assert r.status_code in (401, 403), r.text


# --- RBAC: operations only allowed on assigned vendors ---
class TestRbacOperations:
    def test_ops_forbidden_on_unassigned_vendor(self, ops_token, admin_token):
        # Ensure dv_namma is currently NOT assigned to the ops user
        v = requests.get(
            f"{BASE_URL}/api/ops/vendors/{VENDOR_ID}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        ).json()
        # If somehow already assigned to our ops user, unassign for this test
        if v.get("assigned_ops"):
            requests.put(
                f"{BASE_URL}/api/ops/vendors/{VENDOR_ID}",
                headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
                json={"assigned_ops": ""},
                timeout=30,
            )
        png = _tiny_png()
        r = _upload(ops_token, VENDOR_ID, _make_zip({"Masala Dosa.png": png}))
        assert r.status_code == 403, r.text
        assert "not assigned" in r.json().get("detail", "").lower()

    def test_ops_allowed_after_assignment_then_revert(self, ops_token, admin_token, ops_user_id):
        # PUT /ops/vendors/{id} requires the full OpsVendorBody; fetch current vendor
        # and echo required fields back with the new `assigned_ops` value.
        current = requests.get(
            f"{BASE_URL}/api/ops/vendors/{VENDOR_ID}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        ).json()

        def _put_assigned(ops_id: str):
            payload = {
                "name": current["name"],
                "email": current.get("email", ""),
                "owner_name": current.get("owner_name", ""),
                "category": current.get("category", ""),
                "phone": current.get("phone", ""),
                "restaurant_phone": current.get("restaurant_phone", ""),
                "full_address": current.get("full_address", ""),
                "maps_link": current.get("maps_link", ""),
                "service_type": current.get("service_type", "both"),
                "pickup_start_time": current.get("pickup_start_time", "18:00"),
                "pickup_end_time": current.get("pickup_end_time", "21:00"),
                "status": current.get("status", "active"),
                "discount_percentage": current.get("discount_percentage", 0),
                "storefront_image": current.get("storefront_image", ""),
                "assigned_ops": ops_id,
            }
            return requests.put(
                f"{BASE_URL}/api/ops/vendors/{VENDOR_ID}",
                headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
                json=payload,
                timeout=30,
            )

        original_assigned = current.get("assigned_ops") or ""
        r_assign = _put_assigned(ops_user_id)
        assert r_assign.status_code == 200, r_assign.text
        try:
            png = _tiny_png()
            r = _upload(ops_token, VENDOR_ID, _make_zip({"Masala Dosa.png": png}))
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["updated_count"] == 1
            assert body["matched"][0]["item_name"] == "Masala Dosa"
        finally:
            # revert assignment to its original value
            _put_assigned(original_assigned)
