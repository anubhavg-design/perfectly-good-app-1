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
VENDORS = [
    ("dv_namma", "Namma Tiffins", "Ravi Kumar", "South Indian", "both",
     loc(12.9352, 77.6245, "5th Block, Koramangala, Bengaluru, Karnataka 560095"), [
        ("Masala Dosa", "Crispy dosa with spiced potato filling & chutney", 120, 70, 5, "veg", "dosa"),
        ("Idli Vada Combo", "Two idlis + medu vada with sambar", 90, 50, 8, "veg", "idli"),
        ("Filter Coffee", "Authentic South Indian filter coffee", 40, None, None, "veg", "coffee"),
        ("Ghee Pongal", "Comforting rice & lentil pongal with ghee", 110, None, None, "veg", "pongal"),
     ]),
    ("dv_slice", "Slice of Italy", "Maria Dsouza", "Italian", "both",
     loc(12.9719, 77.6412, "100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038"), [
        ("Margherita Pizza", "Wood-fired pizza with basil & mozzarella", 350, 200, 4, "veg", "pizza"),
        ("Pasta Alfredo", "Creamy white sauce penne pasta", 320, None, None, "veg", "pasta"),
        ("Garlic Bread", "Toasted garlic bread with herbs", 150, 90, 6, "veg", "garlic"),
        ("Tiramisu", "Classic coffee-soaked Italian dessert", 220, None, None, "veg", "tiramisu"),
     ]),
    ("dv_dragon", "Dragon Wok", "Li Wei", "Chinese", "both",
     loc(12.9611, 77.6387, "80 Feet Road, Koramangala, Bengaluru, Karnataka 560034"), [
        ("Veg Hakka Noodles", "Stir-fried noodles with veggies", 180, None, None, "veg", "noodles"),
        ("Chilli Paneer", "Spicy indo-chinese paneer", 240, None, None, "veg", "paneer"),
        ("Veg Fried Rice", "Wok-tossed fried rice", 170, None, None, "veg", "friedrice"),
        ("Manchow Soup", "Hot & spicy soup with crispy noodles", 120, None, None, "veg", "soup"),
     ]),
    ("dv_burger", "Burger Barn", "Sam Fernandes", "Fast Food", "takeaway",
     loc(12.9279, 77.6271, "6th Block, Koramangala, Bengaluru, Karnataka 560095"), [
        ("Classic Veg Burger", "Crispy patty with lettuce & cheese", 150, 90, 10, "veg", "burger"),
        ("Chicken Burger", "Juicy grilled chicken burger", 200, 120, 5, "non_veg", "chickenburger"),
        ("Peri Peri Fries", "Crispy fries tossed in peri peri", 99, None, None, "veg", "fries"),
        ("Cold Coffee", "Thick & creamy cold coffee", 120, None, None, "veg", "coldcoffee"),
     ]),
    ("dv_green", "The Green Bowl", "Ananya Rao", "Healthy", "dine_in",
     loc(12.9784, 77.6408, "CMH Road, Indiranagar, Bengaluru, Karnataka 560038"), [
        ("Quinoa Salad", "Protein-packed quinoa & veggie salad", 280, 160, 3, "veg", "salad"),
        ("Buddha Bowl", "Wholesome grain bowl with hummus", 320, 190, 4, "veg", "bowl"),
        ("Berry Smoothie", "Mixed berry & yogurt smoothie", 180, None, None, "veg", "smoothie"),
     ]),
]


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
