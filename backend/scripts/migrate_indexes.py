"""Manage MongoDB indexes for the Perfectly Good backend.

Run manually after every deploy (idempotent, safe to re-run):

    cd /app/backend
    python -m scripts.migrate_indexes
    python -m scripts.migrate_indexes --dry-run

All indexes are created with `background=True` so Atlas builds don't block reads.
Mongo dedupes by spec; re-running is a no-op on existing indexes.

If a name collision with a different spec is detected (e.g. someone hand-created
an index with the same name but different keys), the script logs a clear error
for that one index and continues — operator must resolve manually.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import OperationFailure

# Load /app/backend/.env regardless of cwd.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_DIR / ".env")


# ── Index specs ────────────────────────────────────────────────────────
# Each entry: (collection, keys, options). `keys` matches motor/pymongo shape.
# Adding an index? Append here; DO NOT edit server.py.
INDEX_SPECS: list[tuple[str, Any, dict]] = [
    # users
    ("users", "email", {"unique": True}),
    ("users", "user_id", {"unique": True}),
    # vendors
    ("vendors", "vendor_id", {"unique": True}),
    ("vendors", "user_id", {}),
    ("vendors", "status", {}),
    ("vendors", "category", {}),
    ("vendors", [("status", 1), ("category", 1)], {}),
    ("vendors", [("location_geo", "2dsphere")], {}),
    # Phase 2 addition: closes the /v2/browse-deals gap (approved).
    ("vendors", [("status", 1), ("discount_percentage", 1)], {}),
    # drops (legacy, empty in current data but kept until Phase 3 cleanup)
    ("drops", "item_id", {"unique": True}),
    ("drops", "vendor_id", {}),
    # menu_items
    ("menu_items", "menu_item_id", {"unique": True}),
    ("menu_items", "vendor_id", {}),
    ("menu_items", "available_today", {}),
    ("menu_items", [("vendor_id", 1), ("available_today", 1)], {}),
    ("menu_items", [("available_today", 1), ("in_stock", 1)], {}),
    ("menu_items", [("vendor_id", 1), ("in_stock", 1)], {}),
    ("menu_items", "food_type", {}),
    # orders
    ("orders", [("vendor_id", 1), ("status", 1)], {}),
    ("orders", [("user_id", 1), ("status", 1)], {}),
    ("orders", "order_id", {"unique": True}),
    ("orders", "user_id", {}),
    ("orders", "vendor_id", {}),
]


def _spec_name(keys: Any) -> str:
    """Reproduce motor/pymongo's default index-name format so we can dedupe on redeploy."""
    if isinstance(keys, str):
        pairs = [(keys, 1)]
    else:
        pairs = list(keys)
    return "_".join(f"{k}_{d}" for k, d in pairs)


async def _create_one(db, collection: str, keys: Any, opts: dict, dry_run: bool) -> str:
    name = opts.get("name") or _spec_name(keys)
    existing = await db[collection].index_information()
    if name in existing:
        return f"[SKIP] {collection}.{name} (already exists)"
    if dry_run:
        return f"[DRY]  {collection}.{name} (would create)"
    try:
        created = await db[collection].create_index(keys, background=True, **opts)
        return f"[OK]   {collection}.{created} (created)"
    except OperationFailure as e:
        return f"[FAIL] {collection}.{name}: {e.details.get('errmsg', str(e))}"


async def _run(dry_run: bool) -> int:
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ.get("DB_NAME", "perfectly_good")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    print(f"# migrate_indexes  (db={db_name}  dry_run={dry_run})")
    exit_code = 0
    try:
        for coll, keys, opts in INDEX_SPECS:
            line = await _create_one(db, coll, keys, opts, dry_run)
            print(line)
            if line.startswith("[FAIL]"):
                exit_code = 1
    finally:
        client.close()
    return exit_code


def main() -> int:
    parser = argparse.ArgumentParser(description="Create/verify MongoDB indexes.")
    parser.add_argument("--dry-run", action="store_true",
                        help="List what would be created without touching Mongo.")
    args = parser.parse_args()
    return asyncio.run(_run(dry_run=args.dry_run))


if __name__ == "__main__":
    sys.exit(main())
