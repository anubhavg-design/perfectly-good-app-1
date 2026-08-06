"""Idempotent seed of dummy restaurants + listings for manual QA of the
Surplus / Takeaway / Dine-in flows. Re-running replaces the same records."""
import asyncio
import os
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "perfectly_good")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

IMG = {
    "dosa": "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=600",
    "idli": "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600",
    "coffee": "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600",
    "pongal": "https://images.unsplash.com/photo-1626500155537-8c1b7c5b0b6a?w=600",
    "pizza": "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600",
    "pasta": "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=600",
    "garlic": "https://images.unsplash.com/photo-1573140247632-f8fd74997d5c?w=600",
    "tiramisu": "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600",
    "noodles": "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600",
    "paneer": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600",
    "friedrice": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600",
    "soup": "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600",
    "burger": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600",
    "chickenburger": "https://images.unsplash.com/photo-1550547660-d9450f859349?w=600",
    "fries": "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600",
    "coldcoffee": "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600",
    "salad": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600",
    "bowl": "https://images.unsplash.com/photo-1546007600-8e6d3a3d3f0a?w=600",
    "smoothie": "https://images.unsplash.com/photo-1505252585461-04db1eb84625?w=600",
}


def loc(lat, lon, address):
    return {"lat": lat, "lon": lon, "address": address,
            "maps_url": f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"}


# (vendor_id, name, owner, category, service_type, location, [items])
# item = (name, desc, original, surplus_price_or_None, qty_or_None, food_type, img_key)
# NOTE (Aug 2026): the 5 dummy demo vendors were permanently removed at the
# user's request. This list is intentionally empty so re-running this script
# will not recreate them.
VENDORS = []


async def main():
    now = datetime.now(timezone.utc)
    for vid, name, owner, category, service_type, location, items in VENDORS:
        await db.vendors.delete_many({"vendor_id": vid})
        await db.menu_items.delete_many({"vendor_id": vid})
        await db.vendors.insert_one({
            "vendor_id": vid, "user_id": f"user_{vid}", "name": name, "owner_name": owner,
            "category": category, "email": f"{vid}@demo.com", "phone": "9000000000",
            "restaurant_phone": "9000000000", "full_address": location["address"],
            "maps_link": location["maps_url"], "location": location, "logo_url": "",
            "service_type": service_type, "pickup_start_time": "18:00", "pickup_end_time": "23:30",
            "status": "active", "assigned_ops": "", "notes": [],
            "created_at": now, "updated_at": now, "last_order_date": None,
        })
        for iname, desc, orig, sp, qty, ftype, imgkey in items:
            surplus = sp is not None
            await db.menu_items.insert_one({
                "menu_item_id": f"{vid}_{imgkey}", "vendor_id": vid, "name": iname,
                "description": desc, "original_price": orig,
                "discounted_price": sp if surplus else round(orig * 0.7, 2),
                "category": category, "serving_size": "1 serving", "food_type": ftype,
                "contains_egg": False, "available_today": surplus,
                "quantity_available": qty, "expiry": "Today" if surplus else "",
                "image_url": IMG[imgkey], "created_at": now, "updated_at": now,
            })
        n_surplus = sum(1 for it in items if it[3] is not None)
        print(f"  seeded {name} ({category}, {service_type}) — {len(items)} items, {n_surplus} surplus")
    print("Dummy vendors seeded.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
