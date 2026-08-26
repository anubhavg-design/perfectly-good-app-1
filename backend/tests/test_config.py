"""Phase 3 — /api/config version gate + rollout bucketing.

Critical: the hard version gate must never regress. If test_v102_client_never_gets_v2
ever fails, we ship a broken 1.0.2 client into a v2 world."""
from __future__ import annotations

import os
import uuid
from typing import Any

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

CFG_URL = f"{BASE_URL}/api/config"


@pytest.fixture
def settings():
    """Snapshot & restore the platform settings doc across tests that flip pct."""
    with MongoClient(MONGO_URL) as mc:
        db = mc[DB_NAME]
        original = db.settings.find_one({"_id": "platform"})
        yield db.settings
        if original is not None:
            db.settings.replace_one({"_id": "platform"}, original)


def _set_pct(settings, value: Any) -> None:
    settings.update_one(
        {"_id": "platform"},
        {"$set": {"v2_lists_rollout_pct": value}},
        upsert=True,
    )


def _get(headers: dict) -> dict:
    r = requests.get(CFG_URL, headers=headers, timeout=10)
    assert r.status_code == 200, f"{r.status_code}: {r.text}"
    return r.json()


# ── 1. Missing version → false regardless of rollout ────────────────────
def test_missing_version_header_forces_v1(settings):
    _set_pct(settings, 100)
    body = _get({"X-Client-Id": str(uuid.uuid4())})
    assert body["use_v2_lists"] is False


# ── 2. THE CRITICAL SAFETY NET: 1.0.2 client at 100% rollout → still v1 ──
def test_v102_client_never_gets_v2(settings):
    """DO NOT allow this test to regress. It's the reason we can crank
    rollout to 100 without bricking the 1.0.2 store binary."""
    _set_pct(settings, 100)
    body = _get({"X-App-Version": "1.0.2", "X-Client-Id": str(uuid.uuid4())})
    assert body["use_v2_lists"] is False, "1.0.2 must NEVER receive use_v2_lists=true"


def test_v100_and_v101_also_gated(settings):
    _set_pct(settings, 100)
    for v in ("1.0.0", "1.0.1", "0.9.9"):
        body = _get({"X-App-Version": v, "X-Client-Id": str(uuid.uuid4())})
        assert body["use_v2_lists"] is False, f"version {v} must be gated"


# ── 3. 1.0.3 with 0% → false ─────────────────────────────────────────────
def test_v103_with_zero_rollout_is_false(settings):
    _set_pct(settings, 0)
    body = _get({"X-App-Version": "1.0.3", "X-Client-Id": str(uuid.uuid4())})
    assert body["use_v2_lists"] is False


# ── 4. 1.0.3 with 100% → true ────────────────────────────────────────────
def test_v103_with_full_rollout_is_true(settings):
    _set_pct(settings, 100)
    body = _get({"X-App-Version": "1.0.3", "X-Client-Id": str(uuid.uuid4())})
    assert body["use_v2_lists"] is True


def test_v110_forward_compatible(settings):
    _set_pct(settings, 100)
    body = _get({"X-App-Version": "1.1.0", "X-Client-Id": str(uuid.uuid4())})
    assert body["use_v2_lists"] is True


# ── 5. Deterministic bucketing (same client_id → same answer) ────────────
def test_bucketing_is_deterministic(settings):
    _set_pct(settings, 50)
    client_id = "phase3-fixed-bucket-key-abc123"
    answers = {_get({"X-App-Version": "1.0.3", "X-Client-Id": client_id})["use_v2_lists"] for _ in range(5)}
    assert len(answers) == 1, f"non-deterministic bucketing: {answers}"


def test_bucketing_spreads_across_clients(settings):
    """With pct=50 we expect roughly half of a wide client_id sample to be True."""
    _set_pct(settings, 50)
    trues = 0
    N = 200
    for i in range(N):
        b = _get({"X-App-Version": "1.0.3", "X-Client-Id": f"client-{i}"})
        if b["use_v2_lists"]:
            trues += 1
    # sha256-mod-100 is uniform; allow generous slack
    assert 60 < trues < 140, f"bucketing skew: {trues}/{N} true"


# ── 6. Malformed inputs never 500 ────────────────────────────────────────
@pytest.mark.parametrize("ver", ["", "garbage", "1", "v1.0.3", "1.a.b", "1.0.3-beta", None])
def test_malformed_version_is_v1_not_500(settings, ver):
    _set_pct(settings, 100)
    headers = {"X-Client-Id": str(uuid.uuid4())}
    if ver is not None:
        headers["X-App-Version"] = ver
    body = _get(headers)
    # "v1.0.3" gets stripped to "1.0.3" so that one may be True; the rest are False.
    if ver == "v1.0.3":
        assert body["use_v2_lists"] is True
    else:
        assert body["use_v2_lists"] is False, f"version={ver!r} unexpectedly enabled v2"


@pytest.mark.parametrize("bad", [-5, 250, "abc", None])
def test_malformed_rollout_pct_defaults_to_v1(settings, bad):
    _set_pct(settings, bad)
    body = _get({"X-App-Version": "1.0.3", "X-Client-Id": str(uuid.uuid4())})
    if isinstance(bad, int) and bad >= 100:
        # 250 clamps to True (per algorithm: >=100 → True)
        assert body["use_v2_lists"] is True
    else:
        assert body["use_v2_lists"] is False


# ── 7. Envelope shape ────────────────────────────────────────────────────
def test_envelope_shape(settings):
    _set_pct(settings, 0)
    body = _get({"X-App-Version": "1.0.3", "X-Client-Id": str(uuid.uuid4())})
    assert set(body.keys()) >= {"use_v2_lists", "cache_ttl_seconds", "min_supported_version", "server_time"}
    assert isinstance(body["use_v2_lists"], bool)
    assert isinstance(body["cache_ttl_seconds"], int)
    assert body["cache_ttl_seconds"] >= 30


# ── 8. When JWT is present, bucket key is user_id, not client_id ────────
def test_authenticated_user_buckets_on_user_id(settings):
    """Two different X-Client-Ids for the same logged-in user must return
    the same use_v2_lists — proves the bucket key is the JWT sub, not the client."""
    _set_pct(settings, 50)
    # Log in as the seeded admin
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "anubhavg@perfectlygood.in", "password": "Anubhavv"},
                      timeout=10)
    if r.status_code != 200:
        pytest.skip(f"admin login unavailable (status={r.status_code})")
    token = r.json()["access_token"]

    a = _get({"X-App-Version": "1.0.3", "X-Client-Id": "device-a", "Authorization": f"Bearer {token}"})
    b = _get({"X-App-Version": "1.0.3", "X-Client-Id": "device-b", "Authorization": f"Bearer {token}"})
    assert a["use_v2_lists"] == b["use_v2_lists"], "authenticated user must bucket on user_id, not client_id"
