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
