# Perfectly Good — PRD

## Overview
"Perfectly Good" is a React Native Expo mobile app for a surplus food marketplace. Users discover and reserve discounted surplus food from nearby restaurants.

## Architecture
- **Frontend**: React Native (Expo SDK 54) with expo-router file-based navigation
- **Backend**: FastAPI with MongoDB (local), JWT auth, bcrypt password hashing
- **Payments**: Razorpay via WebView (test key: rzp_test_SSfFeyx6ytVg0B, order creation mocked)
- **Auth**: JWT Bearer tokens stored in AsyncStorage

## API Endpoints (34 total, all tested)
### Auth (6 endpoints)
- POST /api/auth/register, POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout
- POST /api/auth/forgot-password, POST /api/auth/reset-password

### Drops (3 endpoints)
- GET /api/drops (with search, category, max_price, sort_by filters)
- GET /api/drops/{item_id}, GET /api/drops/categories

### Orders (3 endpoints)
- POST /api/orders/create, POST /api/orders/verify, GET /api/orders/user

### Vendor (6 endpoints)
- GET /api/vendor/menu, GET /api/vendor/drops, POST /api/vendor/drops
- PUT /api/vendor/drops/{id}, GET /api/vendor/orders, PUT /api/vendor/orders/{id}/status

### Admin (6 endpoints)
- GET /api/admin/vendors, POST /api/admin/vendors, DELETE /api/admin/vendors/{id}
- GET /api/admin/vendors/{id}/menu, POST /api/admin/vendors/{id}/menu
- DELETE /api/admin/menu-items/{id}, POST /api/admin/upload

## Seed Data
- Admin: admin@perfectlygood.com / admin123
- Vendor 1: vendor@demo.com / vendor123 (Green Leaf Bakery, 3 menu items, 3 drops)
- Vendor 2: spicegarden@demo.com / vendor123 (Spice Garden, 3 menu items, 3 drops)
- Total: 6 active drops, 6 menu items, 2 vendors

## Recent Changes (June 2026)
- Order pricing: GST 5% + Convenience 5% of subtotal (total = subtotal × 1.10). Percentages hidden from users in checkout breakdown.
- Login page: removed leaf logo icon; tagline = "Perfectly Good Food. Perfectly Low Prices".
- Signup now collects phone number (required, min 10 digits), stored on user; returned in user_response.
- Vendor create-drop: added "Best Before / Expiry" selectable option (Today/Tomorrow/In 2 days/In 3 days), stored on drop, shown on drop detail.

## Order Types — Surplus / Takeaway / Dine-in (July 2026)
- Three customer order types: **Surplus** (primary, discounted), **Takeaway**, **Dine-in**.
- Home screen: "Surplus Deals" horizontal section at top + "Nearby Restaurants" list (surplus-first, distance sorted).
- New Restaurant page `/restaurant/[id]` with 3 tabs (Surplus default w/ green accent, Takeaway, Dine-in).
  - Surplus tab shows `available_today` items at discounted price. If none: shows "No surplus deals available right now" and auto-renders the regular menu with a Takeaway/Dine-in sub-switch.
  - Takeaway & Dine-in show the full menu at the item's original (menu) price.
- Pricing rule: **Surplus listings must be ≥30% off** the menu price — enforced in POST /api/vendor/drops (400 otherwise).
- New endpoints: `GET /api/restaurants`, `GET /api/restaurants/{vendor_id}`.
- `order_type` added to POST /api/orders/create + /verify and persisted on orders; quantity decremented only for surplus. My Orders shows an order-type badge.
- Same Razorpay pay-now flow for all order types; checkout shows an order-type badge and hides "You save" for non-surplus.

## Screens (12 total)
- Login/Register, Forgot Password
- Home Feed (search + filters), Drop Detail, Checkout (Razorpay WebView)
- My Orders, Profile
- Vendor Dashboard (Drops + Orders tabs), Create Drop
- Admin Panel (vendor & menu CRUD)

## Design System
- Primary: #2E7D32, Background: #FDFBF7, Urgent: #C65D47
- Fonts: Outfit (headings), DM Sans (body)
- Cards: 16px radius, floating badges, large food images

## RBAC, Discounts & Photos (July 2026)
- **Per-vendor discount %** (`vendors.discount_percentage`, 0–90): set by Ops/Admin; auto-applied to Takeaway/Dine-in prices customers pay (`price = original × (1 − disc%)`). Surplus is independent (still ≥30% off original). Applied in `_menu_public`, `get_restaurant`, and `POST /orders/create`.
- **Ops visibility**: `operations` role sees ONLY vendors where `assigned_ops == user_id` (enforced in `ops_list_vendors`/`ops_vendor_detail`). Admin sees all. Only Admin can delete vendors and (re)assign vendors to Ops. Ops creating a vendor auto-assigns to self. New `GET /ops/assignable-ops`.
- **Storefront photo** (`vendors.storefront_image`, base64): uploaded by Ops/Admin in VendorForm; shown on vendor profile, Home restaurant card, restaurant hero (fallback logo_url).
- **Vendor menu editing**: `PUT /vendor/menu/{item_id}` lets vendors edit ONLY image_url/kcal/protein of their own items (name/price/description Ops-controlled). Dashboard → Menu tab → Edit modal.
- Checkout fee label renamed "Convenience Fee" → "Payment gateway fees".

## Bulk Upload Images — Ops only (July 2026)
- Ops/Admin can bulk update menu item photos from the Ops Vendor detail page (/ops/vendor/[id]) → "Upload Images" button (next to "Import Excel").
- Flow: upload a ZIP of images. Each filename (minus extension) is matched case-insensitively to an existing menu item `name` for that vendor; only `image_url` (base64 data URI) + `updated_at` are updated. Never creates items or touches other fields.
- Non-image files skipped ("Not an image file"); unmatched names skipped ("No matching menu item"); >5MB skipped; invalid ZIP → 400.
- Endpoint: POST /api/ops/vendors/{vendor_id}/bulk-images (perm manage_menu; operations restricted to assigned vendors). Component: src/ops/BulkImages.tsx. Includes a "Download menu item names" helper to name files correctly.
- Verified: backend 8/8 pytest + Ops web frontend flow (iteration_18).

## Mark as Sold Out (vendor) + daily reset (Aug 2026)
- Vendor Dashboard → Menu tab: each item has a **"Sold Out"** toggle (reuses the `in_stock` field; in_stock=false == sold out). ON greys the card + shows a "SOLD OUT" badge and red caption "Sold out — hidden from customers (auto-resets at midnight)".
- Customer app: sold-out items are hidden from `/api/drops`, `/api/restaurants/{id}` (both surplus + menu lists), and are NOT orderable — `POST /api/orders/create` returns 400 "This item is sold out" (before any Razorpay call) for surplus & takeaway/dine-in.
- Endpoint: `PUT /api/vendor/menu/{item_id}/toggle` {in_stock} also stamps `sold_out_at` (IST date) when marking sold out; clears it when available.
- **Daily reset**: APScheduler (AsyncIOScheduler, tz Asia/Kolkata) runs `reset_sold_out_items` at 00:00 IST → sets in_stock=true for all. On startup a catch-up run restores only items sold out on a PREVIOUS day (today's sold-outs survive a restart). Vendors can also manually re-enable anytime.
- Verified: 13/13 backend pytest (test_sold_out.py) + vendor dashboard UI + reset/catch-up unit check.

## First-login onboarding carousel (customer, Aug 2026)
- After a customer's FIRST login/registration, a full-screen 6-slide onboarding carousel shows before Home; shown once only (device-local flag `pg_onboarded_v1_<userId>` in AsyncStorage via src/utils/onboarding.ts).
- Screen: app/onboarding.tsx (registered in app/_layout.tsx, gestureEnabled:false). Green/white theme, lucide icons per slide (Sparkles, UtensilsCrossed, Tag, ShoppingBag, KeyRound, LifeBuoy). "Skip" top-right on every slide; next arrow on slides 1-5; "Get Started" on the last slide. Uses useWindowDimensions() for correct paging width (module-level Dimensions captured wrong web width).
- Routing (app/index.tsx routeForUser): staff -> /ops, vendor -> /(tabs)/dashboard, customer -> /onboarding if not seen else /(tabs)/home. New registration always -> /onboarding. Finish/Skip marks seen + replaces to /(tabs)/home.

## Onboarding enhancements (Aug 2026)
- Login tagline changed to "Better Choices.\nPerfectly Good." (app/index.tsx).
- Replay Intro: Profile → "View app intro" (customers only, testID view-app-intro-btn) opens app/onboarding.tsx with ?replay=1. In replay mode it does NOT touch the seen/progress flags and returns via router.back() on Skip/Get Started.
- Custom Artwork: replaced lucide icons with branded green/white SVG illustrations per slide (src/components/OnboardingArt.tsx, react-native-svg): plate+leaf+smile, storefront+bag, map pin+% tag, phone+confirm check, pickup-code ticket, support chat+heart.
- Location Prompt: on first-run "Get Started"/last-slide finish, requests foreground location permission (expo-location) before replacing to Home; never blocks entry (already declared in app.json).
- Progress Memory: first-run slide index saved to AsyncStorage (pg_onboarding_progress_<userId>) on each advance; restored on mount; cleared on completion. Helpers in src/utils/onboarding.ts.
