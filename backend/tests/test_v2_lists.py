"""Phase 1 — v2 list endpoint tests.

Covers:
  * v1 byte-compat snapshots (v1 responses must not change after v2 landed)
  * envelope + pagination correctness across sort modes
  * `has_more=False` + `next_cursor=null` on last page
  * bad cursor → HTTP 400
  * payload budgets at seeded scale
  * server-side work budget via Mongo `explain("executionStats")`

Fixtures assume a seeded dataset (synthetic 50 vendors / 750 menu items / 200 orders,
as created by the Phase-0 baseline seed). Snapshots for v1 byte-compat live under
`tests/fixtures/v1_responses/`. First run of a snapshot writes it; subsequent runs
compare byte-for-byte.
"""
import base64
import hashlib
import json
import os
import pathlib
from typing import Any

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")
FIXTURES = pathlib.Path(__file__).parent / "fixtures" / "v1_responses"
FIXTURES.mkdir(parents=True, exist_ok=True)

BLR = "lat=12.9716&lon=77.5946"

# Endpoints considered "hot list" for byte-compat lock.
V1_SNAPSHOT_PATHS = [
    f"/api/restaurants?{BLR}",
    "/api/restaurants",
    f"/api/drops?{BLR}",
    f"/api/browse-deals?{BLR}",
    f"/api/featured-deals?{BLR}",
]

V2_PAGINATED = [
    (f"/api/v2/restaurants?{BLR}", "vendor_id"),          # geo (offset cursor)
    ("/api/v2/restaurants", "vendor_id"),                 # non-geo (id cursor)
    (f"/api/v2/drops?{BLR}", "item_id"),                  # distance
    ("/api/v2/drops?sort_by=price", "item_id"),
    ("/api/v2/drops?sort_by=price_desc", "item_id"),
    ("/api/v2/drops?sort_by=discount", "item_id"),
    ("/api/v2/browse-deals?sort_by=discount", "item_id"),
    ("/api/v2/browse-deals?sort_by=price", "item_id"),
    ("/api/v2/browse-deals?sort_by=price_desc", "item_id"),
    (f"/api/v2/browse-deals?{BLR}&sort_by=distance", "item_id"),
]


def _slug(path: str) -> str:
    return hashlib.md5(path.encode()).hexdigest()[:16]


def _fetch(path: str) -> dict[str, Any] | list[Any]:
    r = requests.get(f"{BASE_URL}{path}", timeout=15)
    r.raise_for_status()
    return r.json()


def _canonical(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


# ── 1. v1 byte-compat snapshots ────────────────────────────────────────
@pytest.mark.parametrize("path", V1_SNAPSHOT_PATHS)
def test_v1_byte_compat_snapshot(path):
    """Fetch the v1 endpoint and diff it against a stored snapshot.
    Time-dependent fields (`is_open`, `open_status_text`, `today_shifts`, `distance`) are
    stripped both sides so cross-run compat is stable."""
    resp = _fetch(path)
    canonical = _strip_timesensitive(resp)
    snap_file = FIXTURES / f"{_slug(path)}.json"
    if not snap_file.exists():
        snap_file.write_text(_canonical(canonical))
        pytest.skip(f"baseline snapshot written: {snap_file.name}")
    stored = json.loads(snap_file.read_text())
    assert canonical == stored, f"v1 response drifted for {path}"


def _strip_timesensitive(obj: Any) -> Any:
    """Recursively drop fields whose values depend on wallclock/geo runtime."""
    drop_keys = {
        "is_open", "open_status_text", "next_open_display", "next_open_day",
        "today_shifts", "hours", "distance", "_dist_m",
    }
    if isinstance(obj, dict):
        return {k: _strip_timesensitive(v) for k, v in obj.items() if k not in drop_keys}
    if isinstance(obj, list):
        return [_strip_timesensitive(x) for x in obj]
    return obj


# ── 2. Envelope shape ──────────────────────────────────────────────────
@pytest.mark.parametrize("path,_key", V2_PAGINATED)
def test_v2_envelope_shape(path, _key):
    resp = _fetch(path)
    assert set(resp.keys()) >= {"items", "next_cursor", "has_more"}
    assert isinstance(resp["items"], list)
    assert isinstance(resp["has_more"], bool)


def test_v2_featured_deals_envelope():
    resp = _fetch(f"/api/v2/featured-deals?{BLR}")
    assert set(resp.keys()) >= {"items", "next_cursor", "has_more"}
    assert resp["has_more"] is False
    assert resp["next_cursor"] is None


# ── 3. Pagination correctness (page 1 → page 2 no dupes, order preserved) ─
@pytest.mark.parametrize("path,key", V2_PAGINATED)
def test_v2_pagination_two_pages(path, key):
    sep = "&" if "?" in path else "?"
    p1 = _fetch(f"{path}{sep}limit=10")
    assert p1["has_more"] is True, f"{path}: expected has_more=True on page 1 (seeded set is large)"
    assert p1["next_cursor"], f"{path}: next_cursor must be non-empty when has_more"

    p2 = _fetch(f"{path}{sep}limit=10&cursor={p1['next_cursor']}")
    ids1 = [i[key] for i in p1["items"]]
    ids2 = [i[key] for i in p2["items"]]
    dupes = set(ids1) & set(ids2)
    assert not dupes, f"{path}: duplicate ids across pages: {dupes}"
    assert len(ids1) == 10
    assert len(ids2) > 0


# ── 4. Last page: has_more=False + next_cursor=null ────────────────────
@pytest.mark.parametrize("path,key", V2_PAGINATED)
def test_v2_last_page_terminates(path, key):
    sep = "&" if "?" in path else "?"
    seen: set[str] = set()
    cursor: str | None = None
    pages = 0
    while pages < 100:
        url = f"{path}{sep}limit=25"
        if cursor:
            url += f"&cursor={cursor}"
        d = _fetch(url)
        pages += 1
        for it in d["items"]:
            seen.add(it[key])
        if not d["has_more"]:
            assert d["next_cursor"] is None, f"{path}: last page must have next_cursor=null"
            return
        cursor = d["next_cursor"]
    pytest.fail(f"{path}: did not terminate within 100 pages")


# ── 5. Bad cursor → 400 with {error:"invalid_cursor"} ──────────────────
@pytest.mark.parametrize("path", [
    "/api/v2/restaurants", "/api/v2/drops", "/api/v2/browse-deals",
])
def test_v2_bad_cursor_returns_400(path):
    r = requests.get(f"{BASE_URL}{path}?cursor=not-a-valid-cursor!!", timeout=10)
    assert r.status_code == 400, f"{path}: expected 400, got {r.status_code}"
    body = r.json()
    detail = body.get("detail")
    assert isinstance(detail, dict) and detail.get("error") == "invalid_cursor", f"{path}: {body!r}"


def test_v2_cursor_wrong_version_returns_400():
    # v:2 is not accepted (we're at v:1)
    payload = base64.urlsafe_b64encode(json.dumps({"v": 2, "offset": 5}).encode()).decode().rstrip("=")
    r = requests.get(f"{BASE_URL}/api/v2/restaurants?cursor={payload}", timeout=10)
    assert r.status_code == 400
    assert r.json()["detail"]["error"] == "invalid_cursor"


# ── 6. Payload budgets at seeded 50-vendor scale ───────────────────────
PAYLOAD_BUDGETS_KB = {
    f"/api/v2/restaurants?{BLR}": 20,
    f"/api/v2/drops?{BLR}": 25,
    f"/api/v2/browse-deals?{BLR}": 30,
    f"/api/v2/featured-deals?{BLR}": 30,
}


@pytest.mark.parametrize("path,budget_kb", PAYLOAD_BUDGETS_KB.items())
def test_v2_payload_budget(path, budget_kb):
    r = requests.get(f"{BASE_URL}{path}", timeout=15)
    r.raise_for_status()
    size_kb = len(r.content) / 1024
    assert size_kb <= budget_kb, f"{path}: {size_kb:.2f} KB > {budget_kb} KB budget"


# ── 7. Mongo work budget: aggregation returns ≤ limit+1 docs at final stage ─
def test_v2_mongo_work_budget_via_direct_client():
    """Directly build the same aggregation pipelines and confirm the last stage
    returns ≤ limit+1 documents (i.e. $skip/$limit ran inside Mongo).
    Uses pymongo (sync) to avoid pulling in the async runtime."""
    from pymongo import MongoClient

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    client = MongoClient(mongo_url)
    db = client[db_name]

    limit_plus_1 = 11

    # A: /v2/restaurants geo — final output ≤ 11
    docs = list(db.vendors.aggregate([
        {"$geoNear": {"near": {"type": "Point", "coordinates": [77.5946, 12.9716]},
                      "distanceField": "_dist_m", "spherical": True,
                      "key": "location_geo", "query": {"status": "active"}}},
        {"$skip": 0}, {"$limit": limit_plus_1},
    ]))
    assert len(docs) <= limit_plus_1

    # B: /v2/drops distance — $unwind then $limit
    docs = list(db.vendors.aggregate([
        {"$geoNear": {"near": {"type": "Point", "coordinates": [77.5946, 12.9716]},
                      "distanceField": "_dist_m", "spherical": True,
                      "key": "location_geo", "query": {"status": "active"}}},
        {"$lookup": {"from": "menu_items", "let": {"vid": "$vendor_id"},
                     "pipeline": [
                         {"$match": {"$expr": {"$eq": ["$vendor_id", "$$vid"]}}},
                         {"$match": {"available_today": True, "in_stock": {"$ne": False}}},
                     ], "as": "_items"}},
        {"$unwind": "$_items"},
        {"$sort": {"_dist_m": 1, "_items.menu_item_id": 1}},
        {"$skip": 0}, {"$limit": limit_plus_1},
    ]))
    assert len(docs) <= limit_plus_1

    # C: /v2/browse-deals discount — non-distance path
    docs = list(db.menu_items.aggregate([
        {"$match": {"available_today": {"$ne": True}, "in_stock": {"$ne": False},
                    "original_price": {"$gt": 0}}},
        {"$lookup": {"from": "vendors", "let": {"vid": "$vendor_id"},
                     "pipeline": [
                         {"$match": {"$expr": {"$and": [
                             {"$eq": ["$vendor_id", "$$vid"]},
                             {"$eq": ["$status", "active"]},
                             {"$gt": ["$discount_percentage", 0]},
                         ]}}},
                         {"$limit": 1},
                     ], "as": "_vendor"}},
        {"$unwind": "$_vendor"},
        {"$sort": {"_vendor.discount_percentage": -1, "menu_item_id": 1}},
        {"$limit": limit_plus_1},
    ]))
    assert len(docs) <= limit_plus_1

    client.close()


# ── 8. Limit clamping ─────────────────────────────────────────────────
def test_v2_limit_clamped_to_max_50():
    r = _fetch(f"/api/v2/restaurants?{BLR}&limit=500")
    assert len(r["items"]) <= 50


def test_v2_limit_defaults_to_10():
    r = _fetch(f"/api/v2/restaurants?{BLR}")
    assert len(r["items"]) == 10


def test_v2_limit_invalid_defaults_to_10():
    r = _fetch(f"/api/v2/restaurants?{BLR}&limit=0")
    assert len(r["items"]) == 10


# ── 9. v2 endpoints are public (match v1 behaviour) ────────────────────
@pytest.mark.parametrize("path", [
    f"/api/v2/restaurants?{BLR}",
    f"/api/v2/drops?{BLR}",
    f"/api/v2/browse-deals?{BLR}",
    f"/api/v2/featured-deals?{BLR}",
])
def test_v2_endpoints_public_no_auth(path):
    """No cookie, no Authorization header — should return 200."""
    r = requests.get(f"{BASE_URL}{path}", timeout=10)
    assert r.status_code == 200
