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

## Onboarding polish round 2 (Aug 2026)
- Deal Preview: added a 7th/final onboarding slide that fetches a live nearby surplus deal (dropsApi.list default Bengaluru coords, sort_by discount) and shows a tappable card (image, name, vendor, price, % off) with "Grab this deal" -> router.replace(/drop/{id}) (marks seen + clears progress first). Fallback message when no deals. "Get Started" still on this last slide. Dots/steps now show 7 (SLIDES.length + 1).
- Personalized Welcome: slide 1 title becomes "Welcome, {firstName}!" from user.name (falls back to "Welcome to Perfectly Good").
- Swipe Hint: animated "Swipe to explore »" pill on slide 1 (first-run only, not replay); hides once the customer advances past slide 1.
- Animated Art: illustrations gently float via a looping RN Animated translateY (useNativeDriver off on web); swipe-hint pill has a subtle translateX bob.

## Become-a-Vendor mail + onboarding deal enhancements (Aug 2026)
- Become a Vendor (Profile, customers): now opens a modal collecting Owner Name, Restaurant Name, City, Mobile, then launches the mail app (Linking mailto) to chaitanya@perfectlygood.in with a prefilled subject/body. testIDs: become-vendor-btn, vendor-owner/restaurant/city/mobile-input, vendor-send-email-btn.
- Onboarding final "deal" slide upgrades:
  - Multiple Picks: fetches top 3 surplus deals (dropsApi.list sort_by=discount, slice 3) and auto-rotates every 4s with dots.
  - Deal Countdown: live "Ends in Xh Ym" overlay on the card (getTimeRemaining from pickup_end_time; refresh each minute).
  - Skip To Deals: "See all deals" -> router.replace('/(tabs)/home?focus=surplus'). Home reads focus param, shows a dismissible "Showing surplus deals only" banner and filters restaurants to surplus_count>0.
  - Warm Empty State: when no deals, shows area name (best-effort reverse geocode if location already granted) + "Notify me when deals go live" -> POST /api/deal-alerts (backend upserts deal_alerts {user_id,email,name,area}); confirmed state after opt-in.
- IMPORTANT (vendor persistence): vendors created via the Ops dashboard are stored in Mongo and are NOT affected by seeding; they persist. Only hardcoded seed/demo vendors were removed earlier.

## Apple 5.1.1 compliance: guest-first browsing + account deletion (Aug 2026)
- GUEST-FIRST: app launches to Home (app/index.tsx is now a redirect gate; guests -> /(tabs)/home). Login form moved to app/login.tsx (route, slide-up, has close X, honors ?next=). Tabs allow guests (removed the !user redirect in (tabs)/_layout.tsx); guest tabs = Home/Orders/Profile.
- Public browse endpoints (no auth): /api/drops, /api/drops/{id}, /api/drops/categories, /api/restaurants, /api/restaurants/{id}, search.
- PROTECTED ACTIONS gated: Orders tab + Profile tab render src/components/GuestGate.tsx (testIDs orders-guest-gate / profile-guest-gate; button guest-gate-signin -> /login?next=<tab>). Reserve is centralized in app/checkout.tsx: guest -> router.replace('/login?next=<encoded /checkout?params>'); after login, login.tsx does router.replace(next) so the user returns to the exact checkout and continues. VERIFIED end-to-end.
- ACCOUNT DELETION relocated to Profile -> 'Settings & Privacy' (testID settings-privacy-btn) -> app/privacy-settings.tsx. Two-step confirmation (permanence Alert -> final Alert) -> accountApi.deleteAccount() (DELETE /api/auth/me) -> logout -> router.replace('/'). Backend deletes user + support_requests + pending_orders + password_reset_tokens + deal_alerts (push token lives on user doc so removed); anonymizes orders (user_name='Deleted user'); staff self-delete blocked (403). VERIFIED (backend 11/11 pytest test_apple_5_1_1.py + iteration_20.json).
- NOTE: Become-a-Vendor email intentionally targets chaitanya@perfectlygood.in per user request (email destination, not a login).

## Apple Sign In + guest prompts + cart memory (Aug 2026)
- APPLE SIGN IN (native iOS only): backend POST /api/auth/apple verifies the Apple identity token against Apple JWKS (jwt.PyJWKClient, RS256, issuer appleid.apple.com, audiences = in.perfectlygood.app + host.exp.Exponent via APPLE_AUDIENCES env default). Upserts user by apple_sub (links existing email), issues our JWT (create_access_token) + cookie, returns access_token. Frontend: authApi.apple + AuthContext.appleLogin; login.tsx shows AppleAuthenticationButton gated by Platform.OS==='ios' && isAvailableAsync (honors ?next=). app.json: ios.usesAppleSignIn=true + plugin expo-apple-authentication. pkg expo-apple-authentication@8.0.8. NOTE: only works on a real iOS build (not Expo Go/web); no user credentials needed (verified vs Apple public keys). Endpoint verified: invalid token -> 401.
- SIGN-IN PROMPT: favourites/reorder features do not exist, so added a gentle dismissible guest banner on Home ('Sign in to save favourites & reorder faster' -> /login), testIDs guest-signin-hint / -cta / -dismiss.
- GUEST CART MEMORY: checkout guest-guard now appends resume=1 to the next URL; after login the app returns to /checkout and auto-invokes handleReserve once (resumedRef guard) so the guest lands straight on payment instead of re-tapping Reserve.

## Ops web dashboard verification + polish (Aug 2026)
- REQUEST: user asked for a "separate web frontend" for the ops dashboard on a custom subdomain (ops.perfectlygood.in). support_agent clarified: Emergent can't deploy a 2nd frontend/custom subdomain from THIS project (mobile deployments don't support custom domains); a separate subdomain needs its own Emergent project reusing the same backend/DB, + support@emergent.sh for the custom domain. User chose option 2 = use the existing web-accessible /ops dashboard from the same deployment (no separate subdomain).
- FINDING: the full ops web dashboard ALREADY EXISTS under /ops (React Native Web) and renders great at desktop widths (verified at 1440px). Fixed dark-green left sidebar + all nav (Dashboard, Analytics, Vendors, Orders, Users, Payouts, Failed Payments, Support Requests w/ open-count badge, Settings), top global search, metric cards, quick actions. Access is restricted by ops/_layout.tsx to STAFF = {admin, operations, customer_success, finance}; vendors/customers are redirected to '/'. Login routes staff -> /ops (login.tsx).
- Feature coverage confirmed: Vendors (list w/ search+category+status filters, add/edit/activate-deactivate/delete, export) + per-vendor page (menu CRUD, mark live/sold-out toggle, Excel import, bulk images, notes, payouts, performance). Orders (filter by period/status, pickup codes shown, status update, refund, test order). Customers (users.tsx search). Support requests (filter, detail, mark resolved, enable WhatsApp). Staff/roles management (settings.tsx: add/role-change/reset-password/remove + roles & permissions view). Commission/pricing/categories/slots settings.
- POLISH: src/ops/ui.tsx Chips now renders the empty '' option as label "All" (was an empty green dot on filter rows). Ops-only shared component; mobile customer app untouched.
- NOTE for future: STAFF still includes customer_success + finance (not just admin+operations). Left as-is since they are internal staff (not vendors/customers) and the staff-management UI creates those roles; narrowing would lock them out. Flag to user before changing.

## Ops: Pickup Verify Tool + Dashboard Date Range (Aug 2026)
- ACCESS confirmed: all 4 internal roles (admin, operations, customer_success, finance) already have web ops access (backend STAFF_ROLES, ops/_layout STAFF, login.tsx routeForUser staff array). No change needed.
- DASHBOARD DATE RANGE: GET /ops/dashboard/stats now takes optional ?range=today|week|month and returns range, range_orders, range_revenue, range_commission (existing keys kept for compat). ops/index.tsx adds a Today/This Week/This Month segmented toggle; refetches stats on change; cards now show range-scoped Orders/Revenue/Commission (labelled "· <range>") + static Total/Active/Pending Vendors, Live Menu Items, Pending Payouts. opsApi.stats(range?).
- PICKUP VERIFY TOOL: POST /ops/orders/verify-pickup {code} requires 'update_order_status' perm. Looks up order by pickup_code; if reserved -> atomically marks picked_up (pickup_verified/by/at) and returns valid:true + order summary; already picked_up / cancelled/refunded/expired -> valid:false + message; unknown code -> 404; empty -> 400. orders.tsx adds a "Verify Pickup" header button (canUpdate) opening a Sheet with a numeric code field + result card (green valid / red invalid, shows order/customer/vendor/item/value/status). opsApi.verifyPickup(code). Reloads order list on success.
- TESTED: curl happy path (135790 temp order -> picked_up), repeat (already picked up), bad code (404), empty (400); stats range today/month. Frontend screenshots verified toggle + verify sheet at 1440px.

## Vendor Onboarding Compliance & Verification (Aug 2026)
- Vendor lifecycle statuses: draft, pending_verification, active, rejected, suspended. Ops/Admin create a vendor login (as before) but it now defaults to DRAFT (ops_create_vendor + OpsVendorBody). No auto-activation; only ADMIN can set active.
- Gating (server.py): customer visibility (/restaurants, /restaurants/{id}, /drops) now requires status=="active" (was !="inactive"). Order creation blocked (400) if the item's vendor isn't active. Go-live blocked: create_vendor_drop 403 + toggle drop available 403 unless active.
- Vendor self-service verification: GET/PUT /api/vendor/verification, POST /api/vendor/verification/submit, GET /api/vendor/agreement. Save allowed in draft/rejected; locked once pending/active/suspended. Submit validates all required fields (Business name/rep/email; GST status + (if registered) GST number+certificate; FSSAI number+certificate; bank holder/number/IFSC/name; typed e-signature name+designation; agreement checkbox + 4 declarations) then sets pending_verification, stores agreement {version, accepted, accepted_at, signature_full_name, signature_designation} + declarations, locks fields. Certificates stored as base64 {name,mime,data} (PDF or image via expo-document-picker).
- Admin agreement mgmt: GET/PUT /api/ops/vendor-agreement (edit content + optional pdf_url; PUT bumps version; admin-only). Default agreement content = full Prajjval Ventures "Vendor Agreement" text v1.0, seeded in settings _id=vendor_agreement.
- Admin compliance review: GET /api/ops/compliance[?status], GET /api/ops/compliance/{id}, POST /api/ops/vendors/{id}/approve|reject(reason req)|suspend (ALL admin-only; operations get 403). ops_vendor_status blocks setting active for non-admin.
- Frontend: app/vendor-verification.tsx (vendor form + status screens for pending/active/suspended + rejection banner; agreement scroll-to-end enables the agree checkbox, auto-enables if content fits). Dashboard banner (testID verification-banner) when status!=active. Admin: app/ops/compliance.tsx (filter chips + review sheet with doc viewers: image inline, PDF opens in new tab on web + approve/reject/suspend) and app/ops/vendor-agreement.tsx (content editor). Nav added to ops/_layout: "Compliance" (view_vendors) + "Vendor Agreement" (manage_roles=admin only).
- Onboarding carousel slide 1 now shows tagline "Better Choices. Perfectly Good." above the welcome title.
- Tested: testing_agent iter20 — backend 24/24 pytest pass (/app/backend/tests/test_vendor_compliance.py), frontend vendor form + admin compliance + agreement editor verified. Draft test vendor: draftvendor@test.in / vendor123 (kept in DRAFT).

## Vendor compliance GATE on login (Aug 2026)
- Bypass-proof gate added in app/(tabs)/_layout.tsx: for role 'vendor' it fetches GET /api/vendor/verification on mount; if status is 'draft' or 'rejected' it renders <Redirect href="/vendor-verification"> BEFORE any tab mounts (spinner while checking). pending_verification/active/suspended pass through to the dashboard. Non-vendors unaffected. Covers both fresh login (login.tsx routes vendor -> /(tabs)/dashboard) and app reload with persisted session (index.tsx same route).
- vendor-verification.tsx made unskippable: when gated (draft/rejected) the header shows a LOGOUT button (no back) so the only escapes are Complete-&-Submit or Log out. For pending/active/suspended (not gated) the header back + a "Go to Dashboard" button navigate to /(tabs)/dashboard. Verified via screenshot: draftvendor@test.in lands straight on the verification form with logout-only header.

## Compliance Badge + Progress Saver (Aug 2026)
- VERIFIED BADGE: _vendor_public() and item_to_drop() now return `verified`/`vendor_verified` = (status=='active' AND verification.agreement.accepted AND verification.fssai_number present). Small "Verified" pill (BadgeCheck icon, primary color) shown next to restaurant name on Home restaurant cards (app/(tabs)/home.tsx) and the restaurant detail hero (app/restaurant/[id].tsx). Grandfathered active vendors without compliance data show no badge. Verified via screenshot (Draft Test Kitchen shows Verified).
- PROGRESS SAVER: vendor-verification.tsx auto-saves text fields with a 1.2s debounce whenever the vendor edits (only while status draft/rejected). Certificates save immediately on upload (PUT includes the cert; debounced text autosave omits certs so backend _apply_verification preserves them). A "Saving…/Progress saved" indicator (testID autosave-indicator) shows under the intro. Manual "Save Draft" button retained. Verified via UI: typing persists business_name across reload.
- NOTE: draftvendor@test.in (vendor_e177d1bc3c50) was patched to ACTIVE + fully compliant to demo the Verified badge (it's the only customer-visible restaurant). It is no longer in draft.

## Admin Testing section (Aug 2026)
- New admin-only ops page /ops/testing (nav "Testing", perm manage_roles = admin only; page also guards role!=admin with an "admin only" message). Backend endpoints (all role==admin else 403): POST /api/ops/testing/orders (creates a labelled test order: status "paid", generated pickup_code, user_name "Test Customer", vendor preferred = one literally named "Perfectly Good" via case-insensitive regex, else falls back to any active/first vendor, item = first menu_item of that vendor, is_test True), GET /api/ops/testing/orders (lists all is_test orders), DELETE /api/ops/testing/orders/{order_id} (only deletes is_test orders; 404 otherwise).
- Frontend app/ops/testing.tsx: "Create Test Order" button + DataTable of test orders with a "TEST" tag on each Order id, PAID status badge, pickup code, and per-row "Delete" button (ConfirmDialog). opsApi.testingCreateOrder/testingListOrders/testingDeleteOrder.
- NOTE: there is no vendor literally named "Perfectly Good" (that's the brand); test orders currently attach to the first active vendor (e.g., Draft Test Kitchen). If a vendor named exactly "Perfectly Good" is created, it will be used.
- The pre-existing Orders-page "Test Order" button (POST /ops/orders/test, status "reserved" for pickup-verify testing) is left unchanged. The main ops Orders list already shows a "TEST" badge for is_test orders (backend returns full order docs incl is_test).

## Admin: Set Temporary Vendor Password (Aug 2026)
- Backend PUT /api/ops/vendors/{vendor_id}/password (admin-only: require_permission manage_vendors + _admin_only). Body {password} (min 6). Sets password_hash (bcrypt hash_password) on the vendor's linked user (vendor.user_id) directly — no old password needed. Mirrors ops_set_staff_password. Verified: admin set 200; short 400; ops(non-admin) 403; vendor login with new pwd 200; old pwd 401.
- Frontend ops/vendors.tsx: admin-only KeyRound icon in the Actions column opens a "Set Temporary Password" Sheet (password input + Generate button + Set Password). opsApi.setVendorPassword(id,password).
- Also (from prior msg): test orders now created with status "reserved" (Ready for Pickup) instead of "paid" so they appear in the vendor Dashboard Orders tab and are pickup-verifiable; existing paid test orders migrated to reserved. Note to user: app has NO vendor "accept order" step — orders auto-confirm on payment (reserved=Ready for Pickup); vendor completes by verifying the 6-digit pickup code (Dashboard→Orders→Verify Pickup).
- Vendor login for testing: draftvendor@test.in / vendor123 (Draft Test Kitchen, active). Password was set via the new tool and reset back to vendor123.

## Fixes: login routing + verification gate + branded loader (Aug 2026)
- LOGIN ROUTING: login.tsx routeForUser(u, nextPath) now (1) fetches authApi.me() if role missing so staff/vendors are never dropped to customer home, and (2) routes staff→/ops and vendor→/(tabs)/dashboard BEFORE honoring `next` (only customers resume `next`). Fixed both password and Apple login paths. Verified: operations login → /ops dashboard.
- VERIFICATION GATE: dashboard banner now hidden for status in ['active','approved'] (was only 'active'); vendor-verification.tsx treats 'approved' same as 'active' (shows active status screen, not the form). Tabs gate still only gates 'draft'/'rejected'. Verified: approved vendor lands on dashboard with NO banner.
- BRANDED LOADER: new src/components/BrandedLoader.tsx — Perfectly Good logo (splash-icon.png) with looping fade+scale animation and rotating messages ('Rescuing good food…','Reducing your bill…','Finding deals near you…'). Replaces the generic ActivityIndicator in app/index.tsx and app/(tabs)/_layout.tsx. Accepts optional `message` prop to pin a single message.

## Mgmt features: vendor pwd change + edit vendor email + bulk menu delete (Aug 2026)
- VENDOR SELF PASSWORD CHANGE: POST /api/auth/change-password {current_password,new_password} (any logged-in user; verifies current via verify_password, min 6). UI: vendor Dashboard → Settings tab → new "Change Password" card (current/new/confirm + button). vendorApi.changePassword.
- ADMIN EDIT VENDOR EMAIL: PUT /api/ops/vendors/{id}/email {email} (admin-only). Validates format, checks uniqueness vs other users, updates vendor.email AND linked user.email (login). UI: Mail icon in ops Vendors actions (admin) → sheet. opsApi.setVendorEmail. Verified: login works with new email.
- BULK MENU DELETE: POST /api/ops/vendors/{id}/menu/bulk-delete {menu_item_ids:[]} (manage_menu/manage_vendors; ops restricted to assigned vendors). UI: ops/vendor/[id].tsx menu section — per-item checkbox + "Select All"/"Deselect All" toolbar + "Delete Selected (n)" with ConfirmDialog. opsApi.bulkDeleteMenu.
- All verified end-to-end via curl (wrong-current 400, correct ok, invalid email 400, uniqueness, bulk delete 2, empty 400) + UI screenshot. Test vendor reset to draftvendor@test.in / vendor123.
