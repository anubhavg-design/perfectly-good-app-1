from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import secrets
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import FastAPI, APIRouter, Request, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
import math
import requests as http_requests

# ── Config ──────────────────────────────────────────────────────────────
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "perfectly_good")
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE = timedelta(hours=24)
REFRESH_TOKEN_EXPIRE = timedelta(days=7)
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "rzp_test_SSfFeyx6ytVg0B")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ── MongoDB ─────────────────────────────────────────────────────────────
mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]

# ── Helpers ─────────────────────────────────────────────────────────────
def gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + ACCESS_TOKEN_EXPIRE,
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + REFRESH_TOKEN_EXPIRE,
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def user_response(user: dict) -> dict:
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user.get("name", ""),
        "role": user.get("role", "user"),
        "picture": user.get("picture"),
        "location": user.get("location"),
        "created_at": user.get("created_at", datetime.now(timezone.utc)).isoformat(),
    }

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))

# ── App ─────────────────────────────────────────────────────────────────
app = FastAPI()
api = APIRouter(prefix="/api")

# ══════════════════════════════════════════════════════════════════════════
#  AUTH
# ══════════════════════════════════════════════════════════════════════════

class RegisterBody(BaseModel):
    name: str
    email: str
    password: str

class LoginBody(BaseModel):
    email: str
    password: str

class ForgotPasswordBody(BaseModel):
    email: str

class ResetPasswordBody(BaseModel):
    token: str
    new_password: str

@api.post("/auth/register")
async def register(body: RegisterBody):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = gen_id("user")
    user_doc = {
        "user_id": user_id,
        "email": email,
        "name": body.name.strip(),
        "password_hash": hash_password(body.password),
        "role": "user",
        "picture": None,
        "location": None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_id, email)
    resp = user_response(user_doc)
    resp["access_token"] = token
    response = JSONResponse(content=resp)
    response.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=86400, path="/")
    return response

@api.post("/auth/login")
async def login(body: LoginBody):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["user_id"], email)
    resp = user_response(user)
    resp["access_token"] = token
    response = JSONResponse(content=resp)
    response.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=86400, path="/")
    return response

@api.get("/auth/me")
async def auth_me(request: Request):
    user = await get_current_user(request)
    return user_response(user)

@api.post("/auth/logout")
async def auth_logout():
    response = JSONResponse(content={"message": "Logged out"})
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return response

@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordBody):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Email not found")
    reset_token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "token": reset_token,
        "user_id": user["user_id"],
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
        "used": False,
    })
    logger.info(f"Password reset token for {email}: {reset_token}")
    return {"reset_token": reset_token}

@api.post("/auth/reset-password")
async def reset_password(body: ResetPasswordBody):
    record = await db.password_reset_tokens.find_one({"token": body.token, "used": False})
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    if record["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expired")
    await db.users.update_one(
        {"user_id": record["user_id"]},
        {"$set": {"password_hash": hash_password(body.new_password)}},
    )
    await db.password_reset_tokens.update_one({"token": body.token}, {"$set": {"used": True}})
    return {"message": "Password reset successfully"}

# ── Push Notifications ──────────────────────────────────────────────────

class PushTokenBody(BaseModel):
    push_token: str

@api.post("/auth/push-token")
async def save_push_token(body: PushTokenBody, request: Request):
    user = await get_current_user(request)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"push_token": body.push_token}},
    )
    return {"message": "Push token saved"}

async def send_push_to_vendor(vendor_id: str, title: str, body: str, data: dict = None):
    """Send push notification to all devices registered for this vendor."""
    vendor = await db.vendors.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        return
    vendor_user = await db.users.find_one({"user_id": vendor.get("user_id")}, {"_id": 0})
    if not vendor_user or not vendor_user.get("push_token"):
        logger.info(f"No push token for vendor {vendor_id}, skipping notification")
        return

    push_token = vendor_user["push_token"]
    message = {
        "to": push_token,
        "sound": "default",
        "title": title,
        "body": body,
        "channelId": "orders",
    }
    if data:
        message["data"] = data

    try:
        resp = http_requests.post(
            "https://exp.host/--/api/v2/push/send",
            json=message,
            headers={"Content-Type": "application/json"},
            timeout=5,
        )
        logger.info(f"Push sent to vendor {vendor_id}: {resp.status_code}")
    except Exception as e:
        logger.error(f"Push notification failed: {e}")

# ══════════════════════════════════════════════════════════════════════════
#  DROPS
# ══════════════════════════════════════════════════════════════════════════

@api.get("/drops/categories")
async def get_categories():
    categories = await db.vendors.distinct("category")
    return categories or []

@api.get("/drops")
async def list_drops(
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    search: Optional[str] = None,
    category: Optional[str] = None,
    max_price: Optional[float] = None,
    sort_by: Optional[str] = None,
):
    query: dict = {"is_active": True}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]
    if category:
        vendor_ids = await db.vendors.distinct("vendor_id", {"category": category})
        query["vendor_id"] = {"$in": vendor_ids}
    if max_price:
        query["discounted_price"] = {"$lte": max_price}

    drops = await db.drops.find(query, {"_id": 0}).to_list(200)

    # Enrich with vendor info
    vendor_cache: dict = {}
    for drop in drops:
        vid = drop.get("vendor_id")
        if vid and vid not in vendor_cache:
            v = await db.vendors.find_one({"vendor_id": vid}, {"_id": 0})
            vendor_cache[vid] = v
        v = vendor_cache.get(vid)
        if v:
            drop["vendor_name"] = v.get("name", "")
            drop["vendor_location"] = v.get("location", {})
            drop["vendor_category"] = v.get("category", "")
        if "created_at" in drop and hasattr(drop["created_at"], "isoformat"):
            drop["created_at"] = drop["created_at"].isoformat()

    if sort_by == "price":
        drops.sort(key=lambda d: d.get("discounted_price", 0))
    elif sort_by == "discount":
        drops.sort(key=lambda d: (d.get("original_price", 1) - d.get("discounted_price", 0)) / max(d.get("original_price", 1), 1), reverse=True)
    elif lat and lon:
        for d in drops:
            vloc = d.get("vendor_location", {})
            if vloc and vloc.get("lat") and vloc.get("lon"):
                d["_dist"] = haversine(lat, lon, vloc["lat"], vloc["lon"])
            else:
                d["_dist"] = 99999
        drops.sort(key=lambda d: d.get("_dist", 99999))
        for d in drops:
            d.pop("_dist", None)

    return drops

@api.get("/drops/{item_id}")
async def get_drop(item_id: str, lat: Optional[float] = None, lon: Optional[float] = None):
    drop = await db.drops.find_one({"item_id": item_id}, {"_id": 0})
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")
    v = await db.vendors.find_one({"vendor_id": drop.get("vendor_id")}, {"_id": 0})
    if v:
        drop["vendor_name"] = v.get("name", "")
        drop["vendor_location"] = v.get("location", {})
        drop["vendor_category"] = v.get("category", "")
    if "created_at" in drop and hasattr(drop["created_at"], "isoformat"):
        drop["created_at"] = drop["created_at"].isoformat()
    return drop

# ══════════════════════════════════════════════════════════════════════════
#  ORDERS
# ══════════════════════════════════════════════════════════════════════════

class CreateOrderBody(BaseModel):
    food_item_id: str
    quantity: int

class VerifyOrderBody(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    food_item_id: str
    quantity: int

@api.post("/orders/create")
async def create_order(body: CreateOrderBody, request: Request):
    user = await get_current_user(request)
    drop = await db.drops.find_one({"item_id": body.food_item_id, "is_active": True}, {"_id": 0})
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found or inactive")
    if body.quantity > drop["quantity_available"]:
        raise HTTPException(status_code=400, detail="Not enough quantity available")

    subtotal = drop["discounted_price"] * body.quantity
    fee = round(subtotal * 0.05)
    total = subtotal + fee
    amount_paise = int(total * 100)

    razorpay_order_id = f"order_{secrets.token_hex(12)}"

    await db.pending_orders.insert_one({
        "razorpay_order_id": razorpay_order_id,
        "user_id": user["user_id"],
        "food_item_id": body.food_item_id,
        "quantity": body.quantity,
        "total_amount": total,
        "created_at": datetime.now(timezone.utc),
    })

    return {
        "razorpay_order_id": razorpay_order_id,
        "key_id": RAZORPAY_KEY_ID,
        "amount": amount_paise,
    }

@api.post("/orders/verify")
async def verify_order(body: VerifyOrderBody, request: Request):
    user = await get_current_user(request)
    pending = await db.pending_orders.find_one({"razorpay_order_id": body.razorpay_order_id}, {"_id": 0})
    if not pending:
        raise HTTPException(status_code=400, detail="Order not found")

    drop = await db.drops.find_one({"item_id": body.food_item_id}, {"_id": 0})
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    vendor = await db.vendors.find_one({"vendor_id": drop.get("vendor_id")}, {"_id": 0})

    order_id = gen_id("order")
    order_doc = {
        "order_id": order_id,
        "user_id": user["user_id"],
        "user_name": user.get("name", ""),
        "food_item_id": body.food_item_id,
        "food_item_name": drop.get("name", ""),
        "vendor_id": drop.get("vendor_id", ""),
        "vendor_name": vendor.get("name", "") if vendor else "",
        "quantity": body.quantity,
        "total_amount": pending.get("total_amount", 0),
        "status": "reserved",
        "pickup_start_time": drop.get("pickup_start_time", ""),
        "pickup_end_time": drop.get("pickup_end_time", ""),
        "razorpay_order_id": body.razorpay_order_id,
        "razorpay_payment_id": body.razorpay_payment_id,
        "created_at": datetime.now(timezone.utc),
    }
    await db.orders.insert_one(order_doc)

    # Decrement available quantity
    await db.drops.update_one(
        {"item_id": body.food_item_id},
        {"$inc": {"quantity_available": -body.quantity}},
    )
    await db.pending_orders.delete_one({"razorpay_order_id": body.razorpay_order_id})

    # Send push notification to vendor
    await send_push_to_vendor(
        vendor_id=drop.get("vendor_id", ""),
        title="New Order!",
        body=f"{user.get('name', 'A customer')} reserved {body.quantity}× {drop.get('name', 'item')} — ₹{pending.get('total_amount', 0)}",
        data={"order_id": order_id, "type": "new_order"},
    )

    return {"message": "Order confirmed", "order_id": order_id}

@api.get("/orders/user")
async def user_orders(request: Request):
    user = await get_current_user(request)
    orders = await db.orders.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for o in orders:
        if "created_at" in o and hasattr(o["created_at"], "isoformat"):
            o["created_at"] = o["created_at"].isoformat()
    return orders

# ══════════════════════════════════════════════════════════════════════════
#  VENDOR
# ══════════════════════════════════════════════════════════════════════════

class CreateDropBody(BaseModel):
    menu_item_id: str
    discounted_price: float
    quantity_available: int
    pickup_start_time: str
    pickup_end_time: str

class ToggleDropBody(BaseModel):
    is_active: bool

class UpdateOrderStatusBody(BaseModel):
    status: str

@api.get("/vendor/menu")
async def vendor_menu(request: Request):
    user = await get_current_user(request)
    if user["role"] not in ("vendor", "admin"):
        raise HTTPException(status_code=403, detail="Not a vendor")
    vendor = await db.vendors.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor profile not found")
    items = await db.menu_items.find({"vendor_id": vendor["vendor_id"]}, {"_id": 0}).to_list(200)
    return items

@api.get("/vendor/drops")
async def vendor_drops(request: Request):
    user = await get_current_user(request)
    if user["role"] not in ("vendor", "admin"):
        raise HTTPException(status_code=403, detail="Not a vendor")
    vendor = await db.vendors.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor profile not found")
    drops = await db.drops.find({"vendor_id": vendor["vendor_id"]}, {"_id": 0}).to_list(200)
    for d in drops:
        if "created_at" in d and hasattr(d["created_at"], "isoformat"):
            d["created_at"] = d["created_at"].isoformat()
    return drops

@api.post("/vendor/drops")
async def create_vendor_drop(body: CreateDropBody, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ("vendor", "admin"):
        raise HTTPException(status_code=403, detail="Not a vendor")
    vendor = await db.vendors.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor profile not found")
    menu_item = await db.menu_items.find_one({"menu_item_id": body.menu_item_id, "vendor_id": vendor["vendor_id"]}, {"_id": 0})
    if not menu_item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    item_id = gen_id("item")
    drop_doc = {
        "item_id": item_id,
        "vendor_id": vendor["vendor_id"],
        "menu_item_id": body.menu_item_id,
        "name": menu_item["name"],
        "description": menu_item.get("description", ""),
        "original_price": menu_item["original_price"],
        "discounted_price": body.discounted_price,
        "quantity_available": body.quantity_available,
        "pickup_start_time": body.pickup_start_time,
        "pickup_end_time": body.pickup_end_time,
        "image_url": menu_item.get("image_url", ""),
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
    }
    await db.drops.insert_one(drop_doc)
    drop_doc.pop("_id", None)
    if hasattr(drop_doc.get("created_at"), "isoformat"):
        drop_doc["created_at"] = drop_doc["created_at"].isoformat()
    return drop_doc

@api.put("/vendor/drops/{item_id}")
async def toggle_vendor_drop(item_id: str, body: ToggleDropBody, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ("vendor", "admin"):
        raise HTTPException(status_code=403, detail="Not a vendor")
    result = await db.drops.update_one({"item_id": item_id}, {"$set": {"is_active": body.is_active}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Drop not found")
    return {"message": "Updated", "is_active": body.is_active}

@api.get("/vendor/orders")
async def vendor_orders(request: Request):
    user = await get_current_user(request)
    if user["role"] not in ("vendor", "admin"):
        raise HTTPException(status_code=403, detail="Not a vendor")
    vendor = await db.vendors.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor profile not found")
    orders = await db.orders.find({"vendor_id": vendor["vendor_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for o in orders:
        o["customer_name"] = o.get("user_name", "Customer")
        if "created_at" in o and hasattr(o["created_at"], "isoformat"):
            o["created_at"] = o["created_at"].isoformat()
    return orders

@api.put("/vendor/orders/{order_id}/status")
async def update_vendor_order_status(order_id: str, body: UpdateOrderStatusBody, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ("vendor", "admin"):
        raise HTTPException(status_code=403, detail="Not a vendor")
    if body.status not in ("picked_up", "cancelled"):
        raise HTTPException(status_code=400, detail="Invalid status")
    result = await db.orders.update_one({"order_id": order_id}, {"$set": {"status": body.status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"message": "Status updated", "status": body.status}

# ── Vendor Payouts ──────────────────────────────────────────────────────

COMMISSION_RATE = 0.15

@api.get("/vendor/payouts/summary")
async def vendor_payouts_summary(request: Request):
    user = await get_current_user(request)
    if user["role"] not in ("vendor", "admin"):
        raise HTTPException(status_code=403, detail="Not a vendor")
    vendor = await db.vendors.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor profile not found")
    vid = vendor["vendor_id"]
    completed = await db.orders.find({"vendor_id": vid, "status": "picked_up"}, {"_id": 0}).to_list(10000)
    total_revenue = 0
    for o in completed:
        drop = await db.drops.find_one({"item_id": o.get("food_item_id")}, {"_id": 0, "discounted_price": 1})
        dp = drop["discounted_price"] if drop else o.get("total_amount", 0) / max(o.get("quantity", 1), 1)
        total_revenue += dp * o.get("quantity", 1)
    total_revenue = round(total_revenue, 2)
    total_commission = round(total_revenue * COMMISSION_RATE, 2)
    net_earnings = round(total_revenue - total_commission, 2)
    payouts = await db.payouts.find({"vendor_id": vid}, {"_id": 0}).to_list(10000)
    total_paid = round(sum(p.get("amount", 0) for p in payouts), 2)
    pending_payout = round(net_earnings - total_paid, 2)
    return {
        "total_orders_completed": len(completed),
        "total_revenue": total_revenue,
        "total_commission": total_commission,
        "net_earnings": net_earnings,
        "total_paid": total_paid,
        "pending_payout": pending_payout,
    }

@api.get("/vendor/payouts/orders")
async def vendor_payouts_orders(request: Request):
    user = await get_current_user(request)
    if user["role"] not in ("vendor", "admin"):
        raise HTTPException(status_code=403, detail="Not a vendor")
    vendor = await db.vendors.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor profile not found")
    completed = await db.orders.find(
        {"vendor_id": vendor["vendor_id"], "status": "picked_up"}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    result = []
    for o in completed:
        drop = await db.drops.find_one({"item_id": o.get("food_item_id")}, {"_id": 0, "discounted_price": 1})
        dp = drop["discounted_price"] if drop else o.get("total_amount", 0) / max(o.get("quantity", 1), 1)
        qty = o.get("quantity", 1)
        line_total = round(dp * qty, 2)
        commission = round(line_total * COMMISSION_RATE, 2)
        result.append({
            "order_id": o["order_id"],
            "food_item_name": o.get("food_item_name", ""),
            "quantity": qty,
            "discounted_price": dp,
            "vendor_earning": round(line_total - commission, 2),
            "commission": commission,
            "created_at": o["created_at"].isoformat() if hasattr(o.get("created_at"), "isoformat") else str(o.get("created_at", "")),
        })
    return result

# ══════════════════════════════════════════════════════════════════════════
#  ADMIN
# ══════════════════════════════════════════════════════════════════════════

class CreateVendorBody(BaseModel):
    name: str
    category: str
    email: str
    password: str
    location: Optional[dict] = None
    logo_url: Optional[str] = None

class AddMenuItemBody(BaseModel):
    name: str
    description: Optional[str] = ""
    original_price: float
    image_url: Optional[str] = ""

class AddPayoutBody(BaseModel):
    vendor_id: str
    amount: float
    note: Optional[str] = ""

@api.get("/admin/vendors")
async def admin_vendors(request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    vendors = await db.vendors.find({}, {"_id": 0}).to_list(200)
    return vendors

@api.post("/admin/vendors")
async def admin_create_vendor(body: CreateVendorBody, request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")

    user_id = gen_id("user")
    vendor_id = gen_id("vendor")
    location = body.location or {"lat": 12.9716, "lon": 77.5946, "address": "Bangalore"}

    await db.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": body.name,
        "password_hash": hash_password(body.password),
        "role": "vendor",
        "picture": None,
        "location": location,
        "created_at": datetime.now(timezone.utc),
    })
    vendor_doc = {
        "vendor_id": vendor_id,
        "user_id": user_id,
        "name": body.name,
        "category": body.category,
        "email": email,
        "location": location,
        "logo_url": body.logo_url or "",
    }
    await db.vendors.insert_one(vendor_doc)
    vendor_doc.pop("_id", None)
    return vendor_doc

@api.delete("/admin/vendors/{vendor_id}")
async def admin_delete_vendor(vendor_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    vendor = await db.vendors.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    await db.vendors.delete_one({"vendor_id": vendor_id})
    await db.users.delete_one({"user_id": vendor.get("user_id")})
    await db.menu_items.delete_many({"vendor_id": vendor_id})
    await db.drops.delete_many({"vendor_id": vendor_id})
    return {"message": "Vendor deleted"}

@api.get("/admin/vendors/{vendor_id}/menu")
async def admin_vendor_menu(vendor_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    items = await db.menu_items.find({"vendor_id": vendor_id}, {"_id": 0}).to_list(200)
    return items

@api.post("/admin/vendors/{vendor_id}/menu")
async def admin_add_menu_item(vendor_id: str, body: AddMenuItemBody, request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    vendor = await db.vendors.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    menu_item_id = gen_id("menu")
    doc = {
        "menu_item_id": menu_item_id,
        "vendor_id": vendor_id,
        "name": body.name,
        "description": body.description or "",
        "original_price": body.original_price,
        "image_url": body.image_url or "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600",
    }
    await db.menu_items.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.delete("/admin/menu-items/{menu_item_id}")
async def admin_delete_menu_item(menu_item_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.menu_items.delete_one({"menu_item_id": menu_item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Menu item not found")
    return {"message": "Menu item deleted"}

# ── Admin Payouts ───────────────────────────────────────────────────────

@api.post("/admin/payouts/add")
async def admin_add_payout(body: AddPayoutBody, request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    vendor = await db.vendors.find_one({"vendor_id": body.vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    payout_doc = {
        "payout_id": gen_id("payout"),
        "vendor_id": body.vendor_id,
        "amount": round(body.amount, 2),
        "note": body.note or "",
        "created_at": datetime.now(timezone.utc),
    }
    await db.payouts.insert_one(payout_doc)
    payout_doc.pop("_id", None)
    if hasattr(payout_doc.get("created_at"), "isoformat"):
        payout_doc["created_at"] = payout_doc["created_at"].isoformat()
    return payout_doc

@api.get("/admin/payouts/vendors")
async def admin_payouts_vendors(request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    vendors = await db.vendors.find({}, {"_id": 0}).to_list(200)
    result = []
    for v in vendors:
        vid = v["vendor_id"]
        completed = await db.orders.find({"vendor_id": vid, "status": "picked_up"}, {"_id": 0}).to_list(10000)
        total_revenue = 0
        for o in completed:
            drop = await db.drops.find_one({"item_id": o.get("food_item_id")}, {"_id": 0, "discounted_price": 1})
            dp = drop["discounted_price"] if drop else o.get("total_amount", 0) / max(o.get("quantity", 1), 1)
            total_revenue += dp * o.get("quantity", 1)
        total_revenue = round(total_revenue, 2)
        commission = round(total_revenue * COMMISSION_RATE, 2)
        net_earnings = round(total_revenue - commission, 2)
        payouts = await db.payouts.find({"vendor_id": vid}, {"_id": 0}).to_list(10000)
        total_paid = round(sum(p.get("amount", 0) for p in payouts), 2)
        result.append({
            "vendor_id": vid,
            "vendor_name": v.get("name", ""),
            "total_orders_completed": len(completed),
            "net_earnings": net_earnings,
            "total_paid": total_paid,
            "pending_payout": round(net_earnings - total_paid, 2),
        })
    return result

@api.get("/admin/payouts/{vendor_id}/history")
async def admin_payout_history(vendor_id: str, request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    payouts = await db.payouts.find({"vendor_id": vendor_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for p in payouts:
        if hasattr(p.get("created_at"), "isoformat"):
            p["created_at"] = p["created_at"].isoformat()
    return payouts

@api.post("/admin/upload")
async def admin_upload(file: UploadFile = File(...), request: Request = None):
    if request:
        user = await get_current_user(request)
        if user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
    contents = await file.read()
    filename = f"upload_{secrets.token_hex(8)}_{file.filename}"
    upload_path = ROOT_DIR / "uploads" / filename
    upload_path.parent.mkdir(parents=True, exist_ok=True)
    with open(upload_path, "wb") as f:
        f.write(contents)
    return {"url": f"/uploads/{filename}", "filename": filename}

# ── Health ──────────────────────────────────────────────────────────────
@api.get("/")
async def root():
    return {"message": "Perfectly Good API", "status": "running"}

# ── Seed Data ───────────────────────────────────────────────────────────
async def seed_data():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@perfectlygood.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    vendor_email = os.environ.get("VENDOR_EMAIL", "vendor@demo.com")
    vendor_password = os.environ.get("VENDOR_PASSWORD", "vendor123")

    # Seed admin
    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:
        admin_id = gen_id("user")
        await db.users.insert_one({
            "user_id": admin_id,
            "email": admin_email,
            "name": "Admin",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "picture": None,
            "location": None,
            "created_at": datetime.now(timezone.utc),
        })
        logger.info(f"Admin seeded: {admin_email}")
    else:
        updates = {}
        if existing_admin.get("role") != "admin":
            updates["role"] = "admin"
        if not verify_password(admin_password, existing_admin.get("password_hash", "")):
            updates["password_hash"] = hash_password(admin_password)
        if updates:
            await db.users.update_one({"email": admin_email}, {"$set": updates})
            logger.info(f"Admin updated: {admin_email}")

    # Seed vendor user + vendor profile
    existing_vendor = await db.users.find_one({"email": vendor_email})
    if not existing_vendor:
        vendor_user_id = gen_id("user")
        vendor_id = gen_id("vendor")
        await db.users.insert_one({
            "user_id": vendor_user_id,
            "email": vendor_email,
            "name": "Demo Vendor",
            "password_hash": hash_password(vendor_password),
            "role": "vendor",
            "picture": None,
            "location": {"lat": 12.9716, "lon": 77.5946, "address": "MG Road, Bangalore"},
            "created_at": datetime.now(timezone.utc),
        })
        await db.vendors.insert_one({
            "vendor_id": vendor_id,
            "user_id": vendor_user_id,
            "name": "Green Leaf Bakery",
            "category": "Bakery",
            "email": vendor_email,
            "location": {"lat": 12.9716, "lon": 77.5946, "address": "MG Road, Bangalore"},
            "logo_url": "",
        })
        logger.info(f"Vendor seeded: {vendor_email}")

        # Seed menu items for this vendor
        menu_items = [
            {"name": "Artisan Croissants (6-pack)", "description": "Freshly baked buttery croissants. Baked this morning!", "original_price": 300, "image_url": "https://images.unsplash.com/photo-1555507036-ab1f4038024a?w=600&h=400&fit=crop"},
            {"name": "Sourdough Bread Loaf", "description": "Rustic sourdough with crispy crust. Made fresh daily!", "original_price": 250, "image_url": "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&h=400&fit=crop"},
            {"name": "Chocolate Cake Slice", "description": "Rich dark chocolate cake, perfectly moist.", "original_price": 180, "image_url": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&h=400&fit=crop"},
        ]
        for mi in menu_items:
            mi_id = gen_id("menu")
            await db.menu_items.insert_one({
                "menu_item_id": mi_id,
                "vendor_id": vendor_id,
                **mi,
            })

        # Seed sample drops
        drops_data = [
            {"menu_idx": 0, "discounted_price": 120, "quantity": 8, "start": "17:00", "end": "20:00"},
            {"menu_idx": 1, "discounted_price": 100, "quantity": 5, "start": "17:00", "end": "20:00"},
            {"menu_idx": 2, "discounted_price": 70, "quantity": 4, "start": "18:00", "end": "21:00"},
        ]
        all_menu = await db.menu_items.find({"vendor_id": vendor_id}, {"_id": 0}).to_list(10)
        for dd in drops_data:
            if dd["menu_idx"] < len(all_menu):
                mi = all_menu[dd["menu_idx"]]
                await db.drops.insert_one({
                    "item_id": gen_id("item"),
                    "vendor_id": vendor_id,
                    "menu_item_id": mi["menu_item_id"],
                    "name": mi["name"],
                    "description": mi["description"],
                    "original_price": mi["original_price"],
                    "discounted_price": dd["discounted_price"],
                    "quantity_available": dd["quantity"],
                    "pickup_start_time": dd["start"],
                    "pickup_end_time": dd["end"],
                    "image_url": mi["image_url"],
                    "is_active": True,
                    "created_at": datetime.now(timezone.utc),
                })
        logger.info("Sample drops seeded")

    # Seed a second vendor
    vendor2_email = "spicegarden@demo.com"
    existing_v2 = await db.users.find_one({"email": vendor2_email})
    if not existing_v2:
        v2_user_id = gen_id("user")
        v2_id = gen_id("vendor")
        await db.users.insert_one({
            "user_id": v2_user_id,
            "email": vendor2_email,
            "name": "Spice Garden",
            "password_hash": hash_password("vendor123"),
            "role": "vendor",
            "picture": None,
            "location": {"lat": 12.9352, "lon": 77.6245, "address": "Koramangala, Bangalore"},
            "created_at": datetime.now(timezone.utc),
        })
        await db.vendors.insert_one({
            "vendor_id": v2_id,
            "user_id": v2_user_id,
            "name": "Spice Garden",
            "category": "Restaurant",
            "email": vendor2_email,
            "location": {"lat": 12.9352, "lon": 77.6245, "address": "Koramangala, Bangalore"},
            "logo_url": "",
        })
        menu2 = [
            {"name": "Butter Chicken Thali", "description": "Full thali with butter chicken, dal, rice, naan and salad.", "original_price": 350, "image_url": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&h=400&fit=crop"},
            {"name": "Paneer Tikka Wrap (2 pcs)", "description": "Smoky paneer tikka in fresh wraps.", "original_price": 220, "image_url": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&h=400&fit=crop"},
            {"name": "Veg Biryani Bowl", "description": "Fragrant basmati rice with mixed vegetables.", "original_price": 280, "image_url": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&h=400&fit=crop"},
        ]
        for mi in menu2:
            mi_id = gen_id("menu")
            await db.menu_items.insert_one({"menu_item_id": mi_id, "vendor_id": v2_id, **mi})
        all_menu2 = await db.menu_items.find({"vendor_id": v2_id}, {"_id": 0}).to_list(10)
        drops2 = [
            {"idx": 0, "dp": 150, "qty": 10, "s": "18:00", "e": "21:00"},
            {"idx": 1, "dp": 90, "qty": 6, "s": "18:00", "e": "21:00"},
            {"idx": 2, "dp": 120, "qty": 8, "s": "17:30", "e": "20:30"},
        ]
        for dd in drops2:
            if dd["idx"] < len(all_menu2):
                mi = all_menu2[dd["idx"]]
                await db.drops.insert_one({
                    "item_id": gen_id("item"),
                    "vendor_id": v2_id,
                    "menu_item_id": mi["menu_item_id"],
                    "name": mi["name"],
                    "description": mi["description"],
                    "original_price": mi["original_price"],
                    "discounted_price": dd["dp"],
                    "quantity_available": dd["qty"],
                    "pickup_start_time": dd["s"],
                    "pickup_end_time": dd["e"],
                    "image_url": mi["image_url"],
                    "is_active": True,
                    "created_at": datetime.now(timezone.utc),
                })
        logger.info("Second vendor seeded")

    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.vendors.create_index("vendor_id", unique=True)
    await db.vendors.create_index("user_id")
    await db.drops.create_index("item_id", unique=True)
    await db.drops.create_index("vendor_id")
    await db.menu_items.create_index("menu_item_id", unique=True)
    await db.menu_items.create_index("vendor_id")
    await db.orders.create_index("order_id", unique=True)
    await db.orders.create_index("user_id")
    await db.orders.create_index("vendor_id")
    logger.info("Database indexes created")

# ── Startup / Shutdown ──────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    await seed_data()
    logger.info("Perfectly Good API started")

@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()

# ── Wire up ─────────────────────────────────────────────────────────────
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
