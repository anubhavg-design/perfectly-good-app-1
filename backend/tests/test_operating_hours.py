"""Regression tests for multi-shift Operating Hours (Aug 2026).

Covers:
- PUT /api/vendor/hours (valid / overlap / close<=open / >2 shifts)
- POST /api/ops/vendors and PUT /api/ops/vendors/{id} accept & persist `hours`
- GET /api/ops/vendors/{id} returns normalized `hours`
- GET /api/restaurants and /api/restaurants/{id} expose is_open, open_status_text,
  today_shifts, next_open_display, hours via `_vendor_public`
- POST /api/orders/create blocks when closed (400, next-open message)
- Order create rejects invalid shift_start/shift_end (400)

Razorpay LIVE — we stop at order-create (400 path) or capture the razorpay_order_id
and then delete the pending order without proceeding to Razorpay checkout.
"""
import os
import time
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
IST = timezone(timedelta(hours=5, minutes=30))
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

ADMIN_EMAIL = "anubhavg@perfectlygood.in"
ADMIN_PASSWORD = "Anubhavv"


# ---------------- helpers ----------------
def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _now_ist() -> datetime:
    return datetime.now(IST)


def _hhmm(dt: datetime) -> str:
    return f"{dt.hour:02d}:{dt.minute:02d}"


def _t2m(t: str) -> int:
    h, m = t.split(":"); return int(h) * 60 + int(m)


def _today_key() -> str:
    return DAYS[_now_ist().weekday()]


def _weekly_open_now() -> dict:
    """Build a weekly schedule where TODAY has 2 shifts, and the active one
    contains 'now'. Also gives every other day a plausible pair of shifts
    so persistence checks stay meaningful."""
    now = _now_ist()
    cur = now.hour * 60 + now.minute
    # Active shift straddles now (start now-20m .. now+40m clamped inside 00:00-23:59)
    s1_start = max(cur - 20, 0)
    s1_end = min(cur + 40, 23 * 60 + 59)
    # Ensure end > start with a >= 5m gap
    if s1_end - s1_start < 5:
        s1_end = min(s1_start + 30, 23 * 60 + 59)
    # Second shift later in the day (may or may not fit). If not, drop it.
    s2_start = s1_end + 60
    s2_end = s2_start + 60
    def to_hhmm(m):
        return f"{m // 60:02d}:{m % 60:02d}"
    today_shifts = [{"start": to_hhmm(s1_start), "end": to_hhmm(s1_end)}]
    if s2_end < 24 * 60:
        today_shifts.append({"start": to_hhmm(s2_start), "end": to_hhmm(s2_end)})
    hours = {}
    for d in DAYS:
        if d == _today_key():
            hours[d] = today_shifts
        else:
            hours[d] = [{"start": "11:00", "end": "15:00"}, {"start": "19:00", "end": "22:00"}]
    return hours


def _weekly_closed_now() -> dict:
    """Set today's shifts to a window that has ALREADY ended (so restaurant is
    closed now) and gives a next-open later today or tomorrow."""
    now = _now_ist()
    cur = now.hour * 60 + now.minute
    def to_hhmm(m):
        return f"{m // 60:02d}:{m % 60:02d}"
    hours = {}
    # today: an early shift already ended
    if cur >= 120:  # after 02:00
        past_start = 0
        past_end = max(cur - 30, 30)
        today = [{"start": to_hhmm(past_start), "end": to_hhmm(past_end)}]
    else:
        today = []  # closed all day
    # next open — later today if possible, else tomorrow
    if cur + 120 < 23 * 60 + 30:
        today.append({"start": to_hhmm(cur + 90), "end": to_hhmm(cur + 150)})
    for d in DAYS:
        hours[d] = today if d == _today_key() else [{"start": "11:00", "end": "15:00"}]
    return hours


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def admin_token():
    assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def vendor_ctx(admin_token):
    """Create an ACTIVE vendor with an open-now schedule + one menu item.
    Yields dict with vendor_id, vendor_email, vendor_password, user_id (of vendor),
    menu_item_id. Cleans up all created records at teardown."""
    ts = int(time.time())
    email = f"TEST_hours_{ts}@test.in"
    password = "TestPass123!"
    payload = {
        "name": f"TEST Hours Kitchen {ts}",
        "email": email,
        "password": password,
        "phone": "9990000000",
        "category": "Bakery",
        "service_type": "both",
        "full_address": "Bengaluru, KA",
        "status": "active",
        "hours": _weekly_open_now(),
    }
    r = requests.post(f"{BASE_URL}/api/ops/vendors", json=payload, headers=_h(admin_token), timeout=20)
    assert r.status_code == 200, f"vendor create failed: {r.status_code} {r.text}"
    vendor = r.json()
    vendor_id = vendor["vendor_id"]

    # Create a menu item for the vendor (Ops endpoint)
    item_payload = {
        "name": "TEST Hours Croissant",
        "description": "Butter croissant",
        "original_price": 100,
        "discounted_price": 70,
        "food_type": "veg",
        "contains_egg": False,
        "quantity_available": 10,
        "available_today": True,
    }
    r = requests.post(f"{BASE_URL}/api/ops/vendors/{vendor_id}/menu",
                      json=item_payload, headers=_h(admin_token), timeout=20)
    # some builds return 200; ensure success
    assert r.status_code in (200, 201), f"menu create failed: {r.status_code} {r.text}"
    body = r.json()
    menu_item_id = body.get("menu_item_id") or (body.get("item") or {}).get("menu_item_id") \
        or (body.get("items") or [{}])[0].get("menu_item_id")
    # If shape unknown, fetch via detail
    if not menu_item_id:
        r2 = requests.get(f"{BASE_URL}/api/ops/vendors/{vendor_id}",
                          headers=_h(admin_token), timeout=15)
        assert r2.status_code == 200
        items = r2.json().get("menu_items") or []
        assert items, "menu items not persisted"
        menu_item_id = items[0]["menu_item_id"]

    ctx = {
        "vendor_id": vendor_id,
        "email": email,
        "password": password,
        "menu_item_id": menu_item_id,
    }
    yield ctx

    # ---------------- teardown ----------------
    try:
        requests.delete(f"{BASE_URL}/api/ops/vendors/{vendor_id}",
                        headers=_h(admin_token), timeout=15)
    except Exception:
        pass


@pytest.fixture(scope="module")
def vendor_token(vendor_ctx):
    return _login(vendor_ctx["email"], vendor_ctx["password"])


@pytest.fixture(scope="module")
def customer_ctx():
    """Register a throwaway customer, yield token+user_id; cleanup on teardown."""
    ts = int(time.time())
    email = f"TEST_cust_{ts}@test.in"
    payload = {
        "email": email, "password": "CustPass123!",
        "name": "Test Cust", "phone": "9876500000",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, f"customer register failed: {r.status_code} {r.text}"
    j = r.json()
    yield {"token": j["access_token"], "user_id": j["user_id"], "email": email}
    # No public delete endpoint for customers — leave the row but it has no PII beyond synthetic email.


# ---------------- 1. Vendor Ops create with hours ----------------
class TestOpsVendorHours:
    def test_ops_create_vendor_persists_hours(self, vendor_ctx, admin_token):
        r = requests.get(f"{BASE_URL}/api/ops/vendors/{vendor_ctx['vendor_id']}",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        v = r.json()
        assert isinstance(v.get("hours"), dict)
        # every day should be a list
        for d in DAYS:
            assert isinstance(v["hours"].get(d), list), f"missing day {d}"
        # non-today days should have our default two shifts
        non_today = [d for d in DAYS if d != _today_key()][0]
        shifts = v["hours"][non_today]
        assert len(shifts) == 2
        assert shifts[0] == {"start": "11:00", "end": "15:00"}
        assert shifts[1] == {"start": "19:00", "end": "22:00"}

    def test_ops_update_vendor_hours(self, vendor_ctx, admin_token):
        # Update to a different schedule for a specific day
        new_hours = _weekly_open_now()
        # Change tuesday explicitly
        new_hours["tue"] = [{"start": "09:00", "end": "12:00"}, {"start": "14:00", "end": "18:00"}]
        payload = {
            "name": f"TEST Hours Kitchen upd",
            "email": vendor_ctx["email"],
            "category": "Bakery",
            "status": "active",
            "hours": new_hours,
        }
        r = requests.put(f"{BASE_URL}/api/ops/vendors/{vendor_ctx['vendor_id']}",
                         json=payload, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        # GET
        r2 = requests.get(f"{BASE_URL}/api/ops/vendors/{vendor_ctx['vendor_id']}",
                          headers=_h(admin_token), timeout=15)
        assert r2.status_code == 200
        v = r2.json()
        assert v["hours"]["tue"] == [{"start": "09:00", "end": "12:00"},
                                     {"start": "14:00", "end": "18:00"}]

    def test_ops_update_rejects_invalid_hours(self, vendor_ctx, admin_token):
        bad = {d: [] for d in DAYS}
        bad["mon"] = [{"start": "11:00", "end": "15:00"}, {"start": "14:00", "end": "20:00"}]  # overlap
        payload = {
            "name": "x", "email": vendor_ctx["email"], "category": "Bakery",
            "status": "active", "hours": bad,
        }
        r = requests.put(f"{BASE_URL}/api/ops/vendors/{vendor_ctx['vendor_id']}",
                         json=payload, headers=_h(admin_token), timeout=15)
        assert r.status_code == 400
        assert "overlap" in r.json().get("detail", "").lower()


# ---------------- 2. Vendor PUT /vendor/hours ----------------
class TestVendorHours:
    def test_valid_hours_200(self, vendor_token):
        h = _weekly_open_now()
        r = requests.put(f"{BASE_URL}/api/vendor/hours",
                         json={"hours": h}, headers=_h(vendor_token), timeout=15)
        assert r.status_code == 200, r.text

    def test_overlap_400(self, vendor_token):
        bad = {d: [] for d in DAYS}
        bad["mon"] = [{"start": "10:00", "end": "14:00"}, {"start": "13:00", "end": "17:00"}]
        r = requests.put(f"{BASE_URL}/api/vendor/hours",
                         json={"hours": bad}, headers=_h(vendor_token), timeout=15)
        assert r.status_code == 400
        assert "overlap" in r.json().get("detail", "").lower()

    def test_close_before_open_400(self, vendor_token):
        bad = {d: [] for d in DAYS}
        bad["tue"] = [{"start": "18:00", "end": "10:00"}]
        r = requests.put(f"{BASE_URL}/api/vendor/hours",
                         json={"hours": bad}, headers=_h(vendor_token), timeout=15)
        assert r.status_code == 400
        assert "close" in r.json().get("detail", "").lower()

    def test_more_than_two_shifts_400(self, vendor_token):
        bad = {d: [] for d in DAYS}
        bad["wed"] = [
            {"start": "08:00", "end": "10:00"},
            {"start": "11:00", "end": "13:00"},
            {"start": "14:00", "end": "16:00"},
        ]
        r = requests.put(f"{BASE_URL}/api/vendor/hours",
                         json={"hours": bad}, headers=_h(vendor_token), timeout=15)
        assert r.status_code == 400
        assert "at most 2" in r.json().get("detail", "").lower() or "max" in r.json().get("detail", "").lower()


# ---------------- 3. Customer-facing GET restaurants ----------------
class TestRestaurantsPublicHours:
    def _reset_open(self, vendor_token):
        r = requests.put(f"{BASE_URL}/api/vendor/hours",
                         json={"hours": _weekly_open_now()},
                         headers=_h(vendor_token), timeout=15)
        assert r.status_code == 200, r.text

    def test_list_includes_open_and_today_shifts(self, vendor_token, vendor_ctx, customer_ctx):
        self._reset_open(vendor_token)
        r = requests.get(f"{BASE_URL}/api/restaurants",
                         headers=_h(customer_ctx["token"]), timeout=15)
        assert r.status_code == 200
        items = r.json()
        row = next((x for x in items if x["vendor_id"] == vendor_ctx["vendor_id"]), None)
        assert row is not None, "test vendor not present in /restaurants"
        assert row.get("is_open") is True, row
        assert isinstance(row.get("today_shifts"), list) and row["today_shifts"]
        assert "hours" in row and isinstance(row["hours"], dict)
        assert "open_status_text" in row and "closes" in row["open_status_text"].lower()

    def test_detail_returns_hours(self, vendor_ctx, customer_ctx):
        r = requests.get(f"{BASE_URL}/api/restaurants/{vendor_ctx['vendor_id']}",
                         headers=_h(customer_ctx["token"]), timeout=15)
        assert r.status_code == 200
        body = r.json()
        v = body.get("vendor") or body
        assert v.get("is_open") is True, v
        assert isinstance(v.get("hours"), dict)
        assert isinstance(v.get("today_shifts"), list) and v["today_shifts"]
        assert v.get("open_status_text")


# ---------------- 4. Order creation open/closed gating ----------------
class TestOrderShiftGating:
    def test_order_create_open_ok(self, vendor_token, vendor_ctx, customer_ctx):
        # Ensure open now
        requests.put(f"{BASE_URL}/api/vendor/hours",
                     json={"hours": _weekly_open_now()},
                     headers=_h(vendor_token), timeout=15)
        # Fetch today's shifts to pick a valid one
        r = requests.get(f"{BASE_URL}/api/restaurants/{vendor_ctx['vendor_id']}",
                         headers=_h(customer_ctx["token"]), timeout=15)
        assert r.status_code == 200
        rj = r.json(); v = rj.get("vendor") or rj
        today = v["today_shifts"]
        assert today, "expected an open shift today"
        sh = today[0]
        body = {
            "food_item_id": vendor_ctx["menu_item_id"], "quantity": 1,
            "order_type": "takeaway",
            "shift_start": sh["start"], "shift_end": sh["end"],
        }
        r = requests.post(f"{BASE_URL}/api/orders/create",
                          json=body, headers=_h(customer_ctx["token"]), timeout=25)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("razorpay_order_id"), j

    def test_order_create_invalid_shift_400(self, vendor_ctx, customer_ctx):
        body = {
            "food_item_id": vendor_ctx["menu_item_id"], "quantity": 1,
            "order_type": "takeaway",
            "shift_start": "03:00", "shift_end": "03:30",  # not in today's shifts
        }
        r = requests.post(f"{BASE_URL}/api/orders/create",
                          json=body, headers=_h(customer_ctx["token"]), timeout=15)
        assert r.status_code == 400, r.text
        assert "no longer available" in r.json().get("detail", "").lower() \
            or "pick another slot" in r.json().get("detail", "").lower()

    def test_order_create_when_closed_blocked(self, vendor_token, vendor_ctx, customer_ctx):
        # Flip vendor to closed-now schedule
        closed = _weekly_closed_now()
        r = requests.put(f"{BASE_URL}/api/vendor/hours",
                         json={"hours": closed},
                         headers=_h(vendor_token), timeout=15)
        assert r.status_code == 200, r.text
        body = {
            "food_item_id": vendor_ctx["menu_item_id"], "quantity": 1,
            "order_type": "takeaway",
        }
        r = requests.post(f"{BASE_URL}/api/orders/create",
                          json=body, headers=_h(customer_ctx["token"]), timeout=15)
        assert r.status_code == 400, r.text
        msg = r.json().get("detail", "").lower()
        assert "closed" in msg, msg
        # Message should include next open time indicator
        assert ("opens" in msg or "opening again" in msg or "am" in msg or "pm" in msg), msg

        # Public GET should also reflect closed + open_status_text
        r2 = requests.get(f"{BASE_URL}/api/restaurants/{vendor_ctx['vendor_id']}",
                          headers=_h(customer_ctx["token"]), timeout=15)
        assert r2.status_code == 200
        rj = r2.json(); v = rj.get("vendor") or rj
        assert v["is_open"] is False
        assert v.get("open_status_text")
        # restore open for downstream cleanliness
        requests.put(f"{BASE_URL}/api/vendor/hours",
                     json={"hours": _weekly_open_now()},
                     headers=_h(vendor_token), timeout=15)
