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

## Vendor surplus UX + Vendor Staff Panel (Aug 2026)
- CREATE DROP UX: vendor-create-drop.tsx now has an "Add Drop" button in the top-right header (enabled once a menu item is selected); removed the bottom "Create Drop" button. Vendor picks item from the list, then taps Add Drop at top.
- VENDOR STAFF role 'vendor_staff': users doc with parent_vendor_id + staff_permissions[] (add_drops|complete_orders|edit_menu). user_response now includes these. Login/index route vendor_staff → /(tabs)/dashboard; tabs _layout showDashboard includes vendor_staff (verification gate only runs for role 'vendor').
- Backend helpers (after get_current_user): _resolve_vendor(user) resolves owner (by user_id) OR staff (by parent_vendor_id) — replaced all 13 `db.vendors.find_one({user_id})` in vendor endpoints. VENDOR_ROLES=('vendor','admin','vendor_staff') replaced the 14 `not in ('vendor','admin')` guards. _require_staff_perm(user,perm) gates: create_vendor_drop & toggle_vendor_drop → add_drops; PUT /vendor/menu/{id} → edit_menu; verify_pickup → complete_orders (owners bypass).
- Staff CRUD (owner-only via _require_vendor_owner, role must be 'vendor'): GET/POST /vendor/staff, PUT/DELETE /vendor/staff/{user_id}. Vendors only see/manage own staff (scoped by parent_vendor_id). Staff cannot manage staff (403).
- UI: dashboard Settings tab → "Staff Management" card (owner only, isOwner=role==='vendor'): add staff (name/email/password + permission checkboxes), per-staff permission toggles (live PUT), remove. vendorApi.listStaff/createStaff/updateStaff/deleteStaff.
- Tested end-to-end: staff create/list, staff login resolves parent vendor (/vendor/drops 200), 403 without complete_orders on verify-pickup, 404 (perm passed) after granting, staff cannot list staff (403). Fixed missing useEffect import in dashboard.tsx.

## Semi-Admin role (Aug 2026)
- New 'semi_admin' role: full view+edit across ops dashboard (all PERMISSIONS except manage_roles), but cannot delete anything. Backend guard _forbid_semi_admin_delete on deletable ops endpoints (menu delete, menu bulk-delete); other deletes already admin/manage_roles gated. Frontend hides all delete/bulk-delete controls for semi_admin. Login routes semi_admin → /ops. Admin creates one via Settings → staff (role semi_admin). Test: semi@perfectlygood.in / semi12345.

## Push Notifications — Emergent managed / SuprSend (Aug 2026)
- Replaced the old Expo Push API (exp.host) implementation with the Emergent managed push relay (SuprSend) via emergentintegrations pattern. Device tokens are NOT stored in Mongo — the relay maps tokens to user_id.
- Backend (server.py):
  - PUSH_BASE_URL=https://integrations.emergentagent.com, PUSH_KEY=os.environ["EMERGENT_PUSH_KEY"] (=placeholder in .env; auto-set at deploy — NEVER edit).
  - Shared httpx.AsyncClient (_push_client) with X-Push-Key header; closed on shutdown.
  - POST /api/register-push {user_id, platform, device_token} → relays to /api/v1/push/users/register.
  - async send_push(recipients, data{title,message,action_url?}, idempotency_key) → /api/v1/push/trigger, chunks 100.
  - send_push_to_vendor (owner + vendor_staff) and send_push_to_all_users (role==user) rewritten on top of send_push. All push calls wrapped in try/except (non-blocking).
- 4 triggers wired:
  1. New order → vendor (in _finalize_order), action_url /dashboard.
  2. Order confirmed → customer (in _finalize_order), action_url /orders.
  3. Pickup reminder → customer, apscheduler interval job send_pickup_reminders() every 10 min, fires ~1h before pickup_start_time (IST), per-order pickup_reminder_sent flag to dedupe, action_url /orders.
  4. Surplus deal alert → all customers (in POST /vendor/drops), action_url /drop/{item_id}.
- Frontend: src/utils/notifications.ts uses getDevicePushTokenAsync → POST /register-push; AuthContext registers on login/app-open with user_id. app/_layout.tsx has module-scope setNotificationHandler + 'default' Android channel, useEffect with addNotificationResponseReceivedListener + getLastNotificationResponseAsync (deeplink/action_url routing) + weekly denied-permission Alert nudge to Linking.openSettings().
- app.json: android.googleServicesFile = ./google-services.json (user to add file). expo-notifications plugin already present.
- CAVEAT: Push only works on native iOS/Android builds after Publish/Deploy/Build (not Expo Go / web). Placeholder key returns 401→500 in preview, which is expected.

## Surplus min discount + Featured Deals (Aug 2026)
- Surplus minimum discount lowered from 30% → 20% (enforced in POST /api/vendor/drops: discounted_price must be ≤ original*0.8; error message updated). Only surplus-creation flow with a min-discount check. Frontend vendor-create-drop.tsx auto-suggest prefill changed from 40% off (×0.6) → 20% off (×0.8).
- New GET /api/featured-deals?lat&lon: one 'featured deal' per ACTIVE restaurant, only restaurants with ≥1 qualifying discounted item.
  - Bestselling path: any item with ≥3 completed (picked_up) orders → pick bestseller with highest % discount.
  - Fallback (few/no orders): most discounted NORMAL (non-surplus) menu item (by %, tiebreak highest original_price).
  - Discount % = surplus % (op vs discounted_price for live available_today items) else vendor flat discount_percentage. Item must be in_stock. Vendor excluded if chosen discount == 0. Sorted by discount desc, then distance.
  - Response includes vendor + item fields + reason ("Bestseller"/"Top deal") + is_surplus. Tap → restaurant page.
  - Validated with seeded data: bestseller-with-highest-discount and top-deal fallback both correct.
- Home screen (app/(tabs)/home.tsx): new "Featured Deals" horizontal section rendered immediately AFTER "Surplus Deals" and before "Nearby Restaurants". Hidden when empty or in surplus-only focus view. API: restaurantsApi.featuredDeals in src/api/client.ts.

## Browse Deals feature (Aug 2026)
- New GET /api/browse-deals?lat&lon&sort_by=price|discount|distance: all discounted NORMAL menu items (vendor discount_percentage>0 applied) across active vendors. Excludes surplus (available_today) and out-of-stock items. Returns item + vendor + verified + distance. Sorts: price asc / discount desc (default; tiebreak price) / distance asc. restaurantsApi.browseDeals in src/api/client.ts.
- New screen app/browse-deals.tsx: back header "Browse Deals", horizontal sort chip bar (Price: Low to High / Discount: High to Low / Nearest to Me), list of deal cards (image, name, vendor+verified, price+strike+distance, % OFF badge). Tap card → /restaurant/{vendor_id}. Uses expo-location getForegroundPermissions (no new prompt). Registered route in app/_layout.tsx (slide_from_right).
- Home entry: "Browse All Deals" card (testID browse-all-deals) placed at top of home ListHeader (after search, before Surplus Deals / restaurant list) → router.push('/browse-deals').
- Validated all 3 sorts + surplus exclusion with seeded data; screens verified via screenshot.

## Multi-shift operating hours (Aug 2026)
- Data model: vendor.hours = {mon..sun: [{start:"HH:MM", end:"HH:MM"}]} (0-2 shifts/day, 24h). Legacy vendors fall back to a single all-days shift built from pickup_start_time/pickup_end_time.
- Backend helpers (server.py): DAYS, _t2m, _fmt12, _vendor_hours (normalize+sort), _validate_hours (≤2 shifts, close>open, no overlap, HH:MM), _open_status (IST-based: is_open, current_shift, next_open_display, status_text like "Open · closes 3:00 PM" / "Opening again at 7:00 PM" / "Opens tomorrow/Sunday at ...").
- _vendor_public now returns: hours, today_shifts, is_open, open_status_text, next_open_display (used by /restaurants, /restaurants/{id}, featured, browse).
- Endpoints: PUT /api/vendor/hours (vendor owner/staff) validates+stores. Ops OpsVendorBody gained optional `hours`; ops_create_vendor + ops_update_vendor validate+store; ops_get_vendor returns normalized hours.
- Ordering: create_order blocks when _open_status.is_open is False (400 "<name> is closed right now. <status>."). Accepts shift_start/shift_end; validates against today's not-yet-ended shifts; stores chosen shift as pickup_start/end in pending; _finalize_order uses pending's pickup times. CreateDropBody pickup fields now optional (per-drop pickup removed).
- Frontend: src/components/HoursEditor.tsx (reusable weekly editor, up to 2 shifts/day, "Copy Monday to all", client validateHours, hoursFromProfile, emptyHours). Used in vendor dashboard Settings ("Operating Hours" card → vendorApi.updateHours) and Ops VendorForm (replaces the old Pickup Start/End fields).
- Customer display: restaurant/[id].tsx shows "Open now"/status chip + "Today: 11:00 AM–3:00 PM, ..." line; passes isOpen/openStatusText/todayShifts to checkout. Home restaurant card shows Open/Closed pill (statusPill). checkout.tsx: Pickup Slot chip selector (today's remaining shifts), Closed banner + disabled "Closed" Pay button when closed; passes shift_start/end to ordersApi.create.
- Verified via scripts: create/update vendor w/ hours (200), /restaurants is_open+today_shifts, PUT /vendor/hours valid(200)+overlap(400)+close<open(400), order blocked when closed (400 w/ next-open msg), invalid shift (400).

## Home UI + filtering + reorder (Aug 2026)
- Text overflow: home restaurant name restName flexShrink:1 + numberOfLines=1; verifiedBadge flexShrink:0 (long names truncate, badge stays).
- Distance + category on EVERY card: restaurant cards already had it; added a cardMetaRow (category · km) to surplus cards (renderSurplusCard uses item.vendor_category + item.distance) and featured cards (item.vendor_category + item.distance). Backend: /drops now returns persistent `distance` (km via haversine when lat/lon); featured-deals returns `vendor_category`; browse-deals returns `category`; /restaurants unchanged (already category+distance).
- Sorting: /restaurants now sorts by distance ASC then area (location.address) alphabetically (removed surplus-first priority).
- Veg Only toggle: home header top-right pill (testID veg-only-toggle, Leaf icon). When ON filters client-side: surplus/featured deals hidden if food_type=='non_veg'; restaurants hidden unless has_veg. Backend adds `has_veg` to /restaurants (any in-stock item with food_type != non_veg via aggregation veg_count).
- Tagline updated to "Upto 70% off. Grab it before it's gone".
- Order again: backend GET /api/orders/{id}/reorder (owner-only) returns fresh checkout params (item price via order_type: surplus discounted_price / else vendor flat discount, vendorName, maxQty, isOpen, openStatusText, todayShifts). 400 if item/vendor unavailable or surplus sold out. Frontend orders.tsx: "Order again" button (RotateCcw, testID reorder-{id}) on ALL non-reserved orders → ordersApi.reorder → router.push('/checkout', params). Reserved orders keep Support/Cancel row.
- Verified via script: has_veg/distance/category on all endpoints, distance-then-area sort (None last), reorder 200 with correct payload.

## Price fallback + price chips (Aug 2026)
- Price fallback (backend, never ₹0): _menu_public surplus_price = discounted_price if >0 else original_price (discount 0 + no strike when equal); item_to_drop adds `price` = discounted_price(>0) else original_price and sets discounted_price=original when missing; featured-deals price falls back to original if <=0. Verified for dp=None, dp=0, missing dp → shows original. Frontend surplus card + restaurant MenuRow use item.price ?? discounted_price ?? original_price and only strike original when original > active price.
- New "See all surplus" screen app/surplus.tsx (route registered in _layout, slide_from_right): fetches /drops, price chips All/Under ₹100/₹200/₹300 (single-select, testID price-{key}), cards show category·km, price+strike+% off+qty, tap → /drop/{id}. Home Surplus Deals section header now has "See all" (testID see-all-surplus) → /surplus.
- Browse Deals screen: added price chip row (All/Under ₹100/₹200/₹300, testID price-{key}) below the sort bar; filters deals by current active price (< threshold). Sort chips unchanged.
- Filter semantics: "Under ₹N" => activePrice < N. activePrice = price ?? discounted_price ?? original_price.

## Vendor add-surplus 2-step flow + WhatsApp support (Aug 2026)
- vendor-create-drop.tsx now a 2-step wizard: Step 1 select ONE menu item + "Next" (testID next-step-btn, disabled until selected); Step 2 discounted price/quantity/expiry/pickup window + "Create Surplus Drop" (testID submit-drop-btn). Header title "Create Surplus Drop"; back on step 2 returns to step 1. Step indicator + selected-item summary added. Backend createDrop payload unchanged.
- Support number changed to +91 91128 75333: src/constants/support.ts SUPPORT_WHATSAPP_NUMBER='919112875333' (used across customer support ticket WhatsApp links).
- Vendor Help & Support: profile.tsx "Help & Support" action is now role-aware — for role vendor/vendor_staff it opens WhatsApp directly (wa.me/919112875333, MessageCircle icon, subtitle "Chat with us on WhatsApp") instead of the ticket flow; customers still go to /support.

## Special hours + WhatsApp prefill + Veg on new screens (Aug 2026)
- Special closures: vendor.special_closures = ["YYYY-MM-DD"]. _open_status now skips closure dates (today closure => closed; next_open scans forward skipping closures). Endpoint PUT /api/vendor/closures {dates} validates YYYY-MM-DD, drops past dates, returns sorted list. Verified: today+past => keeps today only, is_open False "Opens tomorrow at ...", invalid date 400. Dashboard Settings → Operating Hours card now has "Holidays & Closures": "Closed today"/"Closed tomorrow" toggles (testID closure-toggle-0/1) + chips list with remove (closure-remove-{date}); loads profile.special_closures, saves via vendorApi.updateClosures.
- Vendor WhatsApp prefill: profile.tsx fetches vendorApi.profile() when vendor and includes restaurant name in the WhatsApp message: `...I'm the vendor for "<name>" and need some help.` to wa.me/919112875333.
- Veg Only toggle added to Browse Deals (app/browse-deals.tsx) and See-all-Surplus (app/surplus.tsx) headers (testID veg-only-toggle, Leaf icon); filters items by food_type !== 'non_veg', combined with existing price chips.
