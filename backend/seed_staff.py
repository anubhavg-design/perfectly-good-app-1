"""Reset employee/customer accounts and seed the fixed staff list.
Deletes staff + customer users (keeps vendors), then creates the 5 accounts."""
import asyncio
import os
import bcrypt
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()
db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ.get("DB_NAME", "perfectly_good")]


def hp(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def gen_id(prefix: str) -> str:
    import secrets
    return f"{prefix}_{secrets.token_hex(6)}"


STAFF = [
    ("Anubhav", "anubhavg@perfectlygood.in", "Anubhavv", "admin"),
    ("Chaitanya", "chaitanya@perfectlygood.in", "123456789", "operations"),
    ("Kavya Shetty", "kavyashetty975@gmail.com", "123456789", "operations"),
    ("Sandhya", "sas023261@gmail.com", "123456789", "operations"),
    ("Subhash Ramachandra", "subhashramachandraofficial@gmail.com", "123456789", "operations"),
]


async def main():
    # Delete staff + customers; keep vendors
    res = await db.users.delete_many({"role": {"$in": ["admin", "operations", "customer_success", "finance", "user"]}})
    print("deleted users (staff+customers):", res.deleted_count)

    now = datetime.now(timezone.utc)
    for name, email, pwd, role in STAFF:
        await db.users.insert_one({
            "user_id": gen_id("user"), "email": email.strip().lower(), "name": name,
            "password_hash": hp(pwd), "role": role, "permission_overrides": {},
            "phone": "", "picture": None, "location": None, "created_at": now,
        })
        print(f"created {role:11} {email}")

    print("Done. Total users now:", await db.users.count_documents({}))
    print("Vendors kept:", await db.vendors.count_documents({}))


if __name__ == "__main__":
    asyncio.run(main())
