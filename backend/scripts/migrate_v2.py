"""Data migration: unify `drops` into `menu_items`, backfill vendor/menu fields,
seed non-founder staff, promote founder admin, backfill `location_geo` on vendors.

Run manually after every deploy (idempotent, safe to re-run):

    cd /app/backend
    python -m scripts.migrate_v2
    python -m scripts.migrate_v2 --dry-run

Previously ran on FastAPI startup; relocated here in Phase 2 so app boot is
side-effect-free.
"""
from __future__ import annotations

import argparse
import asyncio
import math
import os
import secrets
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import bcrypt
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

_BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_DIR / ".env")

# ── Constants copied from server.py (kept in sync — this file is the migration
#    source of truth for these values; server.py doesn't need them anymore). ──
STAFF_SEED = [
    {"email": "operations@perfectlygood.in", "password": "ops12345",
     "role": "operations", "name": "Ops Team"},
    {"email": "success@perfectlygood.in", "password": "success12345",
     "role": "customer_success", "name": "Customer Success"},
    {"email": "finance@perfectlygood.in", "password": "finance12345",
     "role": "finance", "name": "Finance Team"},
]

STAFF_ROLES = {"admin", "semi_admin", "operations", "customer_success", "finance"}

DEFAULT_SETTINGS = {
    "commission_rate": 0.15,
    "gst_on_commission": 0.18,
    "gst_rate": 0.05,
    "convenience_rate": 0.05,
    "default_discount_pct": 40,
    "categories": ["Bakery", "Restaurant", "Cafe", "Grocery", "QSR", "Cloud Kitchen", "Dessert"],
    "pickup_slots": ["12:00-15:00", "15:00-18:00", "17:00-20:00", "18:00-21:00", "19:00-22:00"],
    "service_types": ["takeaway", "dine_in", "both"],
    # Phase 3: v1↔v2 list rollout controls (0 = safe default: everyone on v1).
    "v2_lists_rollout_pct": 0,
    "config_cache_ttl_seconds": 300,
}

_stats: dict[str, int] = {
    "settings_created": 0,
    "vendor_defaults_backfilled": 0,
    "vendor_geo_backfilled": 0,
    "menu_items_backfilled": 0,
    "orders_remapped": 0,
    "staff_seeded": 0,
    "founder_promoted": 0,
}


def _gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _geo_point(loc: dict | None):
    if not isinstance(loc, dict):
        return None
    lat, lon = loc.get("lat"), loc.get("lon")
    try:
        lat = float(lat); lon = float(lon)
    except (TypeError, ValueError):
        return None
    if lat == 0 and lon == 0:
        return None
    return {"type": "Point", "coordinates": [lon, lat]}


async def _ensure_settings(db, dry_run: bool) -> None:
    doc = await db.settings.find_one({"_id": "platform"})
    if not doc:
        if not dry_run:
            await db.settings.insert_one({"_id": "platform", **DEFAULT_SETTINGS})
        _stats["settings_created"] += 1
        print("[OK]   settings: created platform doc")
    else:
        missing = {k: v for k, v in DEFAULT_SETTINGS.items() if k not in doc}
        if missing:
            if not dry_run:
                await db.settings.update_one({"_id": "platform"}, {"$set": missing})
            print(f"[OK]   settings: added {len(missing)} missing key(s)")


async def _backfill_vendors(db, now: datetime, dry_run: bool) -> None:
    defaults_template = {
        "status": "active", "service_type": "both",
        "owner_name": "", "restaurant_phone": "",
        "assigned_ops": "", "notes": [],
        "pickup_start_time": "18:00", "pickup_end_time": "21:00",
        "discount_percentage": 0, "storefront_image": "",
        "created_at": now, "updated_at": now, "last_order_date": None,
    }
    n = 0
    async for v in db.vendors.find({}):
        loc = v.get("location") if isinstance(v.get("location"), dict) else {}
        defaults = dict(defaults_template)
        defaults["service_type"] = v.get("service_type", "both")
        defaults["full_address"] = loc.get("address", "") if loc else ""
        defaults["maps_link"] = loc.get("maps_url", "") if loc else ""
        updates = {k: val for k, val in defaults.items() if k not in v}
        if updates and not dry_run:
            await db.vendors.update_one({"vendor_id": v["vendor_id"]}, {"$set": updates})
        if updates:
            n += 1
    _stats["vendor_defaults_backfilled"] = n
    print(f"[OK]   vendors: backfilled defaults on {n} doc(s)")


async def _backfill_vendor_geo(db, dry_run: bool) -> None:
    n = 0
    async for v in db.vendors.find(
        {"location_geo": {"$exists": False}},
        {"_id": 0, "vendor_id": 1, "location": 1},
    ):
        gp = _geo_point(v.get("location") or {})
        if not dry_run:
            await db.vendors.update_one({"vendor_id": v["vendor_id"]}, {"$set": {"location_geo": gp}})
        n += 1
    _stats["vendor_geo_backfilled"] = n
    print(f"[OK]   vendors: backfilled location_geo on {n} doc(s)")


async def _merge_drops_into_menu(db, now: datetime, dry_run: bool) -> tuple[int, dict, dict]:
    drops = await db.drops.find({}, {"_id": 0}).to_list(100000)
    drop_by_menu: dict = {}
    drop_itemid_to_menu: dict = {}
    for d in drops:
        mid = d.get("menu_item_id")
        if mid:
            drop_by_menu[mid] = d
            if d.get("item_id"):
                drop_itemid_to_menu[d["item_id"]] = mid
        if d.get("pickup_start_time") and not dry_run:
            await db.vendors.update_one(
                {"vendor_id": d.get("vendor_id"), "pickup_start_time": {"$in": [None, "", "18:00"]}},
                {"$set": {"pickup_start_time": d["pickup_start_time"],
                          "pickup_end_time": d.get("pickup_end_time", "21:00")}},
            )

    n = 0
    async for m in db.menu_items.find({}):
        mid = m["menu_item_id"]
        d = drop_by_menu.get(mid)
        updates: dict = {}
        if "discounted_price" not in m:
            updates["discounted_price"] = d.get("discounted_price") if d else round((m.get("original_price") or 0) * 0.6, 2)
        if "available_today" not in m:
            updates["available_today"] = bool(d.get("is_active")) if d else False
        if "quantity_available" not in m:
            updates["quantity_available"] = d.get("quantity_available") if d else None
        if "expiry" not in m:
            updates["expiry"] = d.get("expiry", "") if d else ""
        for k, val in (("food_type", "veg"), ("contains_egg", False), ("serving_size", ""), ("category", "")):
            if k not in m:
                updates[k] = val
        if "created_at" not in m:
            updates["created_at"] = now
        if updates:
            if not dry_run:
                await db.menu_items.update_one({"menu_item_id": mid}, {"$set": updates})
            n += 1
    _stats["menu_items_backfilled"] = n
    print(f"[OK]   menu_items: merged {len(drops)} drop record(s), backfilled {n} menu item(s)")
    return len(drops), drop_by_menu, drop_itemid_to_menu


async def _remap_legacy_orders(db, drops, drop_itemid_to_menu, dry_run: bool) -> None:
    if not drop_itemid_to_menu:
        print("[OK]   orders: no legacy drop-item ids to remap")
        return
    n = 0
    async for o in db.orders.find({"food_item_id": {"$in": list(drop_itemid_to_menu.keys())}}):
        new_mid = drop_itemid_to_menu.get(o.get("food_item_id"))
        d = next((x for x in drops if x.get("item_id") == o.get("food_item_id")), None) if drops else None
        set_fields: dict = {"food_item_id": new_mid, "legacy_item_id": o.get("food_item_id")}
        if d and o.get("item_subtotal") is None:
            set_fields["item_subtotal"] = round((d.get("discounted_price") or 0) * (o.get("quantity") or 1), 2)
            set_fields["discounted_price"] = d.get("discounted_price", 0)
        if not dry_run:
            await db.orders.update_one({"order_id": o["order_id"]}, {"$set": set_fields})
        n += 1
    _stats["orders_remapped"] = n
    print(f"[OK]   orders: remapped {n} legacy order(s)")


async def _seed_staff_and_promote_founder(db, now: datetime, dry_run: bool) -> None:
    n = 0
    for s in STAFF_SEED:
        existing = await db.users.find_one({"email": s["email"]})
        if not existing:
            if not dry_run:
                await db.users.insert_one({
                    "user_id": _gen_id("user"), "email": s["email"], "name": s["name"],
                    "password_hash": _hash_password(s["password"]), "role": s["role"],
                    "permission_overrides": {}, "picture": None, "location": None,
                    "created_at": now,
                })
            n += 1
        elif existing.get("role") not in STAFF_ROLES:
            if not dry_run:
                await db.users.update_one({"email": s["email"]}, {"$set": {"role": s["role"]}})
    _stats["staff_seeded"] = n
    print(f"[OK]   users: seeded {n} staff account(s)")

    # Promote known founder admin if present
    if not dry_run:
        res = await db.users.update_one(
            {"email": "anubhavg@perfectlygood.in", "role": {"$ne": "admin"}},
            {"$set": {"role": "admin"}},
        )
        if res.modified_count:
            _stats["founder_promoted"] = 1
            print(f"[OK]   users: promoted founder to admin")


async def _run(dry_run: bool) -> int:
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ.get("DB_NAME", "perfectly_good")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    print(f"# migrate_v2  (db={db_name}  dry_run={dry_run})")
    now = datetime.now(timezone.utc)
    try:
        await _ensure_settings(db, dry_run)
        await _backfill_vendors(db, now, dry_run)
        await _backfill_vendor_geo(db, dry_run)
        n_drops, drop_by_menu, drop_itemid_to_menu = await _merge_drops_into_menu(db, now, dry_run)
        drops_list = await db.drops.find({}, {"_id": 0}).to_list(100000)
        await _remap_legacy_orders(db, drops_list, drop_itemid_to_menu, dry_run)
        await _seed_staff_and_promote_founder(db, now, dry_run)
    finally:
        client.close()
    print(f"# migrate_v2 complete  stats={_stats}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="One-shot data migration (idempotent).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would change without writing.")
    args = parser.parse_args()
    return asyncio.run(_run(dry_run=args.dry_run))


if __name__ == "__main__":
    sys.exit(main())
