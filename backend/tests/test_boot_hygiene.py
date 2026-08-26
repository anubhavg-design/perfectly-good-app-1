"""Phase 2 — boot hygiene tests.

Assertions:
  1. FastAPI app boot does NOT call `AsyncIOMotorCollection.create_index`.
  2. `server.py` no longer defines `migrate_v2`.
  3. `scripts.migrate_indexes --dry-run` exits 0 and reports every index in INDEX_SPECS.
  4. Running `scripts.migrate_indexes` for real creates the Phase-2 addition
     `status_1_discount_percentage_1` on `vendors`.
  5. `/api/openapi.json` and `/api/docs` are reachable (ingress-friendly URLs).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
import requests

BACKEND_DIR = Path(__file__).resolve().parent.parent
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")


# ── 1. No create_index at app startup ──────────────────────────────────
def test_startup_makes_no_create_index_calls():
    """Import server + trigger startup lifespan; assert create_index was never called."""
    # Subprocess isolation so pytest's own imports don't influence the boot path.
    script = r"""
import sys
sys.path.insert(0, ".")
from unittest.mock import patch
import motor.motor_asyncio as _motor
calls = []
orig = _motor.AsyncIOMotorCollection.create_index

async def counting(self, *a, **kw):
    calls.append((self.name, a, kw))
    return await orig(self, *a, **kw)

with patch.object(_motor.AsyncIOMotorCollection, "create_index", counting):
    import server
    from fastapi.testclient import TestClient
    with TestClient(server.app):
        pass
print("CREATE_INDEX_CALLS", len(calls))
for c in calls[:20]: print("  ", c)
sys.exit(0)
"""
    env = dict(os.environ, MONGO_URL=os.environ.get("MONGO_URL", "mongodb://localhost:27017"),
               DB_NAME=os.environ.get("DB_NAME", "test_database"),
               JWT_SECRET=os.environ.get("JWT_SECRET", "audit_only_local_dev_secret"))
    r = subprocess.run([sys.executable, "-c", script], cwd=str(BACKEND_DIR),
                       capture_output=True, text=True, timeout=60, env=env)
    assert r.returncode == 0, f"subprocess failed:\nstdout={r.stdout}\nstderr={r.stderr}"
    line = [ln for ln in r.stdout.splitlines() if ln.startswith("CREATE_INDEX_CALLS")]
    assert line, f"marker line missing:\nstdout={r.stdout}"
    count = int(line[0].split()[-1])
    assert count == 0, f"expected 0 create_index calls during startup, got {count}\n{r.stdout}"


# ── 2. migrate_v2 no longer lives in server.py ─────────────────────────
def test_server_py_no_migrate_v2():
    src = (BACKEND_DIR / "server.py").read_text()
    assert "async def migrate_v2" not in src, "migrate_v2 should be moved to scripts/migrate_v2.py"
    assert "await migrate_v2()" not in src, "migrate_v2 must not be called at startup"


def test_server_py_seed_data_has_no_create_index():
    """The whole seed_data function should still exist but hold no create_index calls."""
    import ast
    tree = ast.parse((BACKEND_DIR / "server.py").read_text())
    seed_data = next((n for n in ast.walk(tree)
                      if isinstance(n, ast.AsyncFunctionDef) and n.name == "seed_data"), None)
    assert seed_data is not None, "seed_data must still exist (staff seed)"
    body_src = ast.unparse(seed_data)
    assert "create_index" not in body_src, "seed_data must not call create_index"


# ── 3. migrate_indexes --dry-run ───────────────────────────────────────
def test_migrate_indexes_dry_run_lists_all_specs():
    r = subprocess.run(
        [sys.executable, "-m", "scripts.migrate_indexes", "--dry-run"],
        cwd=str(BACKEND_DIR), capture_output=True, text=True, timeout=30,
    )
    assert r.returncode == 0, r.stderr
    # New Phase-2 index must show up in dry-run output
    assert "vendors.status_1_discount_percentage_1" in r.stdout, r.stdout
    # And so must at least one existing one, to prove it enumerated the full list
    assert "vendors.location_geo_2dsphere" in r.stdout, r.stdout


# ── 4. migrate_indexes real run creates the new compound index ─────────
def test_migrate_indexes_real_run_creates_new_index():
    # Run for real (idempotent — no-op if already applied by a previous test run)
    r = subprocess.run(
        [sys.executable, "-m", "scripts.migrate_indexes"],
        cwd=str(BACKEND_DIR), capture_output=True, text=True, timeout=60,
    )
    assert r.returncode == 0, r.stderr

    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    with MongoClient(mongo_url) as mc:
        info = mc[db_name].vendors.index_information()
    assert "status_1_discount_percentage_1" in info, \
        f"new compound index missing from vendors: {sorted(info.keys())}"


# ── 5. OpenAPI + docs on /api/* ─────────────────────────────────────────
def test_openapi_url_under_api_prefix():
    r = requests.get(f"{BASE_URL}/api/openapi.json", timeout=10)
    assert r.status_code == 200, f"/api/openapi.json returned {r.status_code}"
    body = r.json()
    assert "openapi" in body and "paths" in body
    v2_paths = [p for p in body["paths"] if p.startswith("/api/v2/")]
    assert len(v2_paths) == 4, f"expected 4 v2 endpoints, got: {v2_paths}"


def test_docs_url_under_api_prefix():
    r = requests.get(f"{BASE_URL}/api/docs", timeout=10)
    assert r.status_code == 200
    assert "swagger" in r.text.lower() or "openapi" in r.text.lower()


def test_root_openapi_url_no_longer_served():
    """The pre-Phase-2 URL is now a 404 (proves the move, not a duplicate mount)."""
    r = requests.get(f"{BASE_URL}/openapi.json", timeout=10)
    assert r.status_code == 404
