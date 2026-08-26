# Phase 0 — Perf Baseline

**Captured:** 2026-08-25 (audit run against imported repo `anubhavg-design/perfectly-good-app-1@3b9b607`)
**Purpose:** Frozen numbers to diff against after Phase 1+. Do NOT overwrite; append a new "Phase N" section instead.

## Dataset (SYNTHETIC — clearly labelled)

The shipped `backend/seed_dummy.py` has `VENDORS = []` (production data was permanently wiped). To capture meaningful baseline numbers, a synthetic dataset was inserted from `/tmp/baseline_seed.py` (audit-only, not part of `/app`):

| Collection    | docs before | docs after (synthetic added) |
|---------------|-------------|------------------------------|
| `vendors`     | 0           | **50** (all `status:"active"`, spread ~±0.15° around Bangalore) |
| `menu_items`  | 0           | **750** (15/vendor; ~35% `available_today=true`, all `in_stock=true`) |
| `orders`      | 0           | **200** (all `status:"picked_up"`, random vendor/item mix) |
| `users`       | 0 (pre-seed)→ **5** (staff seeded at boot) | 5 |
| `settings`    | 1           | 1 |

Every synthetic doc carries `synthetic: true` so it can be identified/purged with:
`db.{vendors,menu_items,orders}.deleteMany({synthetic: true})`.

Data volume is intentionally modest — meant to reveal *plan shape* (COLLSCAN vs IXSCAN, `totalDocsExamined` vs `nReturned`), not to stress-test at production scale.

## Response Time & Payload Size (median of 3 curl runs, localhost:8001)

All calls include `lat=12.9716&lon=77.5946` (Bangalore centre) so nearest-first path is exercised.

| Endpoint | Median | Body size | Notes |
|---|---|---|---|
| `GET /api/restaurants?lat&lon` | **9 ms** | **18.25 KB** (18,688 B) | 50 slim vendor cards; uses `$geoNear` |
| `GET /api/browse-deals?lat&lon` | **28 ms** | **171.89 KB** (176,016 B) | 482 items returned; per-item vendor lookup happens in-memory |
| `GET /api/featured-deals?lat&lon` | **11 ms** | **26.91 KB** (27,554 B) | 50 items (one per vendor); scans all orders + all menu |
| `GET /api/drops?lat&lon` (aux) | **33 ms** | **304.94 KB** (312,257 B) | 268 items; full drop shape with vendor embed per item |

The two payload outliers on 50 vendors / 750 menu items are already `>170 KB` and `>300 KB`. At 500+ vendors / 10k+ menu items this scales roughly linearly (unbounded `to_list(100000)`).

## `explain("executionStats")` — Mongo query plans

Index list at capture time (auto-created by `seed_data()` at startup):

- `vendors`: `_id`, `vendor_id`(uniq), `user_id`, `status`, `category`, `status_1_category_1`, **`location_geo_2dsphere`**
- `menu_items`: `_id`, `menu_item_id`(uniq), `vendor_id`, `available_today`, `vendor_id_1_available_today_1`, `available_today_1_in_stock_1`, `vendor_id_1_in_stock_1`, `food_type`
- `orders`: `_id`, `order_id`(uniq), `user_id`, `vendor_id`, `vendor_id_1_status_1`, `user_id_1_status_1`
- `users`: `_id`, `email`(uniq), `user_id`(uniq)
- `drops`: `_id`, `item_id`(uniq), `vendor_id` — **collection is empty; index unused, legacy from migrate_v2**

### A. `/restaurants` → `vendors.aggregate($geoNear)`
- Stages: `GEO_NEAR_2DSPHERE` + `IXSCAN(location_geo_2dsphere)` + `FETCH`
- Index used: ✅ `location_geo_2dsphere`
- Note: aggregate `.explain()` didn't populate `executionStats` scalars in this Mongo build; wall-clock endpoint time (9 ms median) is the source of truth here.

### B. `/restaurants` → `menu_items` aggregate (per-vendor menu/surplus/veg counts)
- Stages: `IXSCAN(vendor_id_1_available_today_1)` + `PROJECTION_COVERED`
- `executionTimeMillis=1`, `totalDocsExamined=0`, `totalKeysExamined=750`, `nReturned=750`
- **Fully covered** by the compound index. Good.

### C. `/drops` → `menu_items.find({available_today:true, in_stock:{$ne:false}, vendor_id:{$in:...}})`
- Stages: `IXSCAN(available_today_1_in_stock_1)` + `FETCH`
- `executionTimeMillis=1`, `totalDocsExamined=268`, `totalKeysExamined=268`, `nReturned=268`
- Index used. Selectivity fine at this size. `.to_list(500)` cap.

### D. `/browse-deals` → `menu_items.find({vendor_id:{$in:...}, available_today:{$ne:true}})`
- Stages: `IXSCAN(available_today_1)` + `FETCH`
- `executionTimeMillis=1`, `totalDocsExamined=482`, `totalKeysExamined=483`, `nReturned=482`
- **482/482 examined** — fine now, but call site uses **`.to_list(100000)`** (no cap, no server-side sort/pagination — sort + paginate happen in Python after the full pull). This is the biggest scale-out risk.

### E. `/featured-deals` → `orders.find({vendor_id:{$in:...}, status:"picked_up"})`
- Stages: `IXSCAN(vendor_id_1_status_1)` + `FETCH`
- `executionTimeMillis=0`, `totalDocsExamined=200`, `totalKeysExamined=200`, `nReturned=200`
- Index used. Call site `.to_list(100000)` — same scale risk.

### F. `/featured-deals` → `menu_items.find({vendor_id:{$in:...}})`
- Stages: `IXSCAN(vendor_id_1)` + `FETCH`
- `executionTimeMillis=1`, `totalDocsExamined=750`, `totalKeysExamined=750`, `nReturned=750`
- Index used. Call site `.to_list(100000)`. **Every request scans the entire menu catalog.**

## Signal for later phases

- `restaurants` list is already well-shaped (slim card, `$geoNear`, covered aggregate). Payload is small.
- `browse-deals` and `featured-deals` are the two clear hot paths — they read **everything** into memory every request and then sort/filter/dedupe in Python. Under 500 vendors / 10k items the response body alone will be several MB.
- `drops` also uses `.to_list(500)` and re-embeds a slim vendor per item — fine for now, but no server-side pagination.
- No endpoint has real cursor pagination. `/restaurants` and `/browse-deals` accept `limit/offset` but the underlying query still pulls the full result before slicing.

---

# Phase 1 — v2 List Endpoints (2026-08-25)

**What shipped:** Four new endpoints under `/api/v2/` with real server-side pagination, cursor envelope `{items, next_cursor, has_more}`, trimmed card payloads, and single-aggregation server work. Nothing on `/api/*` was modified; nothing was added to `carts`/`orders`; no indexes were created or dropped.

**Diff footprint on `server.py`:** two changes only — an append of the v2 block (lines 4905–5434) and one new `app.include_router(api_v2)` line. All 122 v1 handlers, helpers, middleware, and startup logic are byte-identical.

## Endpoint perf (same seeded dataset as Phase 0)

| Endpoint | v1 median | v1 body | **v2 median** | **v2 body** | Δ latency | Δ body |
|---|---:|---:|---:|---:|---:|---:|
| `restaurants?lat&lon` | 9 ms | 18.25 KB | **6 ms** | **3.60 KB** | **−33%** | **−80.3%** |
| `browse-deals?lat&lon` | 28 ms | 171.89 KB | **45 ms** | **4.91 KB** | +61% (see note) | **−97.1%** |
| `featured-deals?lat&lon` | 11 ms | 26.91 KB | **10 ms** | **4.35 KB** | **−9%** | **−83.8%** |
| `drops?lat&lon` (v2 aux) | 33 ms | 304.94 KB | **9 ms** | **4.88 KB** | **−73%** | **−98.4%** |

**Body sizes are all well under the acceptance budgets** (20 / 25 / 30 / 30 KB).

**On the `browse-deals` +17 ms latency:** v1 pulls 482 items into Python and sorts there; v2 does an indexed `$match` + `$lookup` + `$unwind` + `$sort` inside Mongo, which is inherently more work per request but **bounded** (11 docs out of the pipeline vs. 482 whole objects out to Python + across the wire). The 172 KB → 4.91 KB payload shrink is the trade the phase is designed to buy. Under production load (with real network cost per byte across the LTE last mile), the v2 shape is a large net win. Phase 2's index work (`{status:1, discount_percentage:1}` on `vendors` for the lookup filter) is expected to close most of this latency gap.

## Server-side work budget verified via `explain("executionStats")`

| Aggregation | Final-stage `nReturned` | Indexes hit |
|---|---:|---|
| `/v2/restaurants` geo pipeline (`limit=10`) | **11** | `location_geo_2dsphere` (GEO_NEAR_2DSPHERE) |
| `/v2/drops` distance pipeline | **11** | `location_geo_2dsphere` |
| `/v2/browse-deals` discount pipeline | **11** | `available_today_1` (base match), `vendor_id_1` (join) |
| `/v2/featured-deals` geo pipeline | ≤ 10 (no pagination) | `location_geo_2dsphere` + `vendor_id_1` (per-vendor featured lookup) |

`nReturned=11` on the final stage across every paginated pipeline proves `$skip`/`$limit` is running inside MongoDB, not in Python.

## Pagination correctness

Full end-to-end pagination walk (limit=25) over every sort mode:

- `/v2/restaurants` geo: 2 pages → 50 unique vendor_ids, terminates cleanly.
- `/v2/restaurants` non-geo: 2 pages → 50 unique vendor_ids.
- `/v2/drops` × {distance, price, discount}: 11 pages each → **268 unique item_ids each** (matches the surplus-item explain count).
- `/v2/browse-deals` × {discount, price, distance}: 16 pages each → **385 unique item_ids each** (matches the "non-surplus × discount>0-vendor" universe: 482 non-surplus items × ~80% vendors with `discount_percentage>0` ≈ 385).

No duplicates across pages in any mode. `has_more=False` and `next_cursor=null` on every final page. Bad cursors return HTTP 400 with `{"detail":{"error":"invalid_cursor"}}`.

## Indexes — unchanged since Phase 0

Diff of `db.{collection}.getIndexes()` vs. Phase 0 baseline: **empty**. Confirms no index changes.

## Test suite

- `backend/tests/test_v2_lists.py`: **52 tests, all passing** on rerun (byte-compat snapshots stored under `tests/fixtures/v1_responses/` on first pass; enforced on subsequent runs). Includes: envelope shape, pagination correctness across all sort modes, last-page termination, bad-cursor 400 (also wrong-version cursor 400), payload budgets, direct Mongo work-budget assertion, limit clamping, public-access smoke.
- Pre-existing test failures in the repo (`test_multi_item_cart`, `test_order_types`, `test_pickup_verification`, `test_vendor_compliance`, parts of `test_ops_dashboard`, etc.) are **unrelated to Phase 1**: they hardcode vendor IDs (`VENDOR_A = "vendor_e177d1bc3c50"`) that live in the previously-shipped dummy dataset. The current `seed_dummy.py` has `VENDORS = []` (production data removed at the user's request per the file comment). These fail on setup with HTTP 404 before touching any v1 or v2 handler.

## Payload savings summary at seeded 50-vendor / 750-menu-item scale

| Endpoint | v1 payload | v2 payload | Saved per request |
|---|---:|---:|---:|
| restaurants | 18.25 KB | 3.60 KB | **14.65 KB** |
| drops (aux) | 304.94 KB | 4.88 KB | **300.06 KB** |
| browse-deals | 171.89 KB | 4.91 KB | **166.98 KB** |
| featured-deals | 26.91 KB | 4.35 KB | **22.56 KB** |
| **Home tab first paint** (rest + drops + featured, all 3 rails) | 348.99 KB | 12.83 KB | **336.16 KB (−96%)** |

Linear projection to 500-vendor production: v1 home-tab first-paint crosses **≈3.5 MB**; v2 stays flat at ~13 KB thanks to pagination and per-card trimming.

---

# Phase 2 — Boot Hygiene + Compound Index (2026-08-25)

**What shipped:**
- Extracted every `create_index` call out of `server.py`'s `seed_data()` into `backend/scripts/migrate_indexes.py` (`--dry-run` supported, `background=True` on every index).
- Extracted `migrate_v2()` out of the app startup path into `backend/scripts/migrate_v2.py` (idempotent, `--dry-run` supported).
- Added one approved compound index: `vendors {status: 1, discount_percentage: 1}`.
- Refactored the two v2 `$lookup` shapes that filter on vendor status/discount to use `localField/foreignField + plain $match` so the new compound index is actually leveraged.
- Fixed OpenAPI ingress: FastAPI now serves `/api/openapi.json`, `/api/docs`, `/api/redoc` (was `/openapi.json` etc — not reachable through the `/api/*` ingress).

**Diff footprint on `server.py`:** 4 focused edits (FastAPI constructor kwargs, index block removed from `seed_data`, `migrate_v2` + `STAFF_SEED` block removed, `migrate_v2()` call removed from `@startup`), plus two `$lookup` shape refactors in the v2 handlers. No v1 handler touched — byte-compat snapshot suite still passes.

## Boot log — clean

```
Started reloader process
Started server process
Waiting for application startup.
Adding job "reset_sold_out_items" ...
Adding job "send_pickup_reminders" ...
Scheduler started
[WARN] Object storage init failed (uploads will fall back to base64) ← unrelated
Perfectly Good API started
Application startup complete.
```

No `Database indexes created`, no `migrate_v2 complete`, no `create_index` invocations (verified in `test_boot_hygiene.py::test_startup_makes_no_create_index_calls` via `motor.motor_asyncio.AsyncIOMotorCollection.create_index` patch + subprocess).

## Index changes

```
$ db.vendors.index_information() | keys
_id_
category_1
location_geo_2dsphere
status_1
status_1_category_1
status_1_discount_percentage_1     ← NEW (Phase 2)
user_id_1
vendor_id_1
```

Every other collection's index list is identical to Phase 0/1 (verified — `menu_items`, `orders`, `users`, `drops`, `settings` unchanged).

## /v2/browse-deals latency (target endpoint for this phase)

| Mode | Phase 1 median | **Phase 2 median** | Δ |
|---|---:|---:|---:|
| `?lat&lon` (default = `discount`, non-distance path) | 45 ms | **35 ms** | **−22%** |
| `?sort_by=price` (non-distance) | 45 ms | **35 ms** | **−22%** |
| `?lat&lon&sort_by=distance` (geoNear path) | ~45 ms (untested) | **8 ms** | **−82%** |

The compound `{status:1, discount_percentage:1}` index does its job when the `$lookup` sub-pipeline is expressed as `localField/foreignField + plain $match` (Mongo can't use compound indexes inside `$expr`). Distance mode uses the pre-existing `location_geo_2dsphere` and got a big win by moving the filter out of Python.

**Not at v1's 28 ms yet** — the residual bottleneck is the base `menu_items` scan (`available_today:{$ne:true}, in_stock:{$ne:false}, original_price:{$gt:0}`) which currently uses `available_today_1` and examines all 482 non-surplus items even to produce a page of 10. Closing that gap would need either a materialized "discountable items" view or a partial index gated on `available_today:false` — flagged for a future phase, not added here.

## /v2 latency table — full

| Endpoint | Phase 1 median | **Phase 2 median** | Body |
|---|---:|---:|---:|
| `/v2/restaurants?lat&lon` | 6 ms | **6 ms** | 3.60 KB |
| `/v2/drops?lat&lon` (distance) | 9 ms | **9 ms** | 4.88 KB |
| `/v2/browse-deals?lat&lon` (discount) | 45 ms | **35 ms** | 4.91 KB |
| `/v2/featured-deals?lat&lon` | 10 ms | **10 ms** | 4.35 KB |

## Ingress-friendly OpenAPI

```
GET /api/openapi.json  →  200  (with 4 v2 endpoints listed)
GET /api/docs           →  200  (Swagger UI)
GET /openapi.json      →  404  (correctly moved, not double-mounted)
```

## Tests

- `test_v2_lists.py`: **52 passed** (unchanged, byte-compat snapshots still hold).
- `test_boot_hygiene.py`: **8 passed** — startup 0 create_index calls, `migrate_v2` not in server.py, dry-run enumerates all specs, real run creates `status_1_discount_percentage_1`, `/api/openapi.json` = 200, `/api/docs` = 200, `/openapi.json` = 404.

## Candidate indexes spotted but NOT added (per phase constraint — list-only)

Left here for whoever plans the next perf phase:

1. **`menu_items {available_today: 1, discounted_price: 1, menu_item_id: 1}`** — would cover `/v2/drops` sort=price cursor pagination end-to-end.
2. **`menu_items {available_today: 1, original_price: 1, menu_item_id: 1}`** — same purpose for `/v2/browse-deals` sort=price (post-discount price is computed at query time so we sort by pre-discount `original_price` with a fixed vendor discount).
3. **Partial index on menu_items** `{available_today: 1, in_stock: 1}` **filtered by** `{original_price: {$gt: 0}}` — would let the `/v2/browse-deals` base scan hit only ~385 discountable items instead of all 482.
4. **`orders {vendor_id: 1, food_item_id: 1, status: 1}`** — only useful if we ever restore the bestseller-preference in featured-deals (Phase 1 dropped it).

None of these are needed to hit acceptance criteria for future phases as written — they're pre-baked options for whichever phase targets the residual 35 ms `browse-deals` cost.

---

# Phase 3 — Remote Config + Adapter (2026-08-25)

**What shipped:**
- Backend `GET /api/config` endpoint with hard version gate (< 1.0.3 → v1 unconditionally) + deterministic sha256-mod-100 bucketing on `user_id` (if authed) or `X-Client-Id` (fallback).
- Settings-doc keys `v2_lists_rollout_pct` (default 0) and `config_cache_ttl_seconds` (default 300) added by `scripts/migrate_v2.py`.
- Mobile: `src/api/{config,adapter,clientId}.ts` + adapter tests + config tests. Every request now carries `X-App-Version` and `X-Client-Id` headers. All four list APIs consumed via one adapter (`restaurants`, `drops`, `browseDeals`, `featuredDeals`).
- Version bumps: `app.json` → `1.0.3`, iOS `buildNumber` `1.0.3`, Android `versionCode` `137`.
- `RELEASE_1_0_3.md` at repo root with EAS build/submit commands, device-test checklist, and rollout runbook (10 → 50 → 100, plus kill-switch).

**No perf change measured — infrastructure phase.**
Payloads and Mongo work are identical to Phase 2. The point of Phase 3 is that the shipping 1.0.2 binary is now provably immune to v2 rollout (verified by `test_v102_client_never_gets_v2`), and the v2-capable 1.0.3 client can be dialed in incrementally.

## Version gate — live proof (from a real curl against the pod)

```
$ mongosh> db.settings.updateOne({_id:"platform"}, {$set:{v2_lists_rollout_pct:100}})

$ curl /api/config -H "X-App-Version: 1.0.3" -H "X-Client-Id: c1"
{"use_v2_lists":true, ...}                                    ✅ 1.0.3 client can receive v2

$ curl /api/config -H "X-App-Version: 1.0.2" -H "X-Client-Id: c1"
{"use_v2_lists":false, ...}                                    ✅ 1.0.2 client protected

$ curl /api/config -H "X-Client-Id: c1"    # no X-App-Version header
{"use_v2_lists":false, ...}                                    ✅ safe default
```

## Tests

- **Backend:** `test_config.py` — 21 tests, all passing. Covers missing header, 1.0.2 gate, 0/100 rollout, deterministic bucketing (5 repeat calls same answer + 200-client statistical spread check), malformed inputs (empty string, "garbage", null, "1.a.b", "v1.0.3", "1.0.3-beta"), out-of-range rollout_pct, user_id vs client_id bucket key precedence.
- **Total backend suite:** **81 passed** (52 v2 + 8 boot-hygiene + 21 config).
- **Mobile:** `src/api/__tests__/{adapter,config}.test.ts` — jest-syntax unit tests covering v1 wrapping, v2 pass-through, cursor round-trip, network-equivalence when flag is off, 500/timeout/malformed-JSON resilience. Run with `yarn add -D jest jest-expo @types/jest && yarn test` once mobile toolchain is set up on the release box.

## Byte-compat with 1.0.2

Two new headers ride on every request from 1.0.3 (`X-App-Version`, `X-Client-Id`). Both are ignored by v1 handlers. v1 URL + query params + method are unchanged. Byte-compat snapshot suite (`test_v1_byte_compat_snapshot`) still passes.

---

# Phase 4 — Surplus Pagination + Home Re-Render Fix (2026-08-25)

**Frontend-only phase.** Same 1.0.3 binary. Backend byte-identical to Phase 3 (`git diff backend/` is empty).

**What shipped:**
- `src/components/SurplusRail.tsx` — new component owning its own 60s countdown tick. Wrapped in `React.memo` with a shallow-equality prop comparator on `items` / `loading`.
- `app/(tabs)/home.tsx` — removed the `tick` state, the top-level `setInterval`, and the inline `renderSurplusCard`. The surplus horizontal rail is now `<SurplusRail items={vegDrops} loading={dropsLoading} />`. Restaurants FlatList has no `extraData` prop (implicitly stable). `vegDrops`, `vegFeatured`, `vegRestaurants`, and `restaurantsData` all memoized via `useMemo`. `renderFeaturedCard` and `renderRestaurant` are both `useCallback`-wrapped with correct deps.
- `app/surplus.tsx` — full infinite-scroll rewrite: `PAGE_SIZE=10`, cursor state, `hasMore`/`loadingMore` states, `onEndReached` with threshold `1.5`, `initialNumToRender/maxToRenderPerBatch/windowSize/removeClippedSubviews` props matching `browse-deals.tsx`. Footer renders spinner while `loadingMore`, "You've seen all deals" when `hasMore=false`. Client-side veg + price filters apply on the accumulated list via `useMemo`. `renderCard` memoized. The `// TODO(phase-4): paginate` comment is gone.

## Render-count assertion (structural, from `home_rerender.test.ts`)

The test does not need a live RN renderer to prove the fix — it reads the source and asserts:

- `home.tsx` has **no `tick` state declaration**.
- `home.tsx` has **no `setInterval(...setTick)`**.
- The restaurants FlatList block **does not contain `extraData={tick}`**.
- `renderRestaurant` is wrapped in `useCallback`.
- `SurplusRail` is imported into home.
- `SurplusRail.tsx` **does** contain `setInterval(() => setTick(...))` and **is** wrapped in `React.memo`.

This structural set of assertions is what fails loudly if the storm ever regresses — no need to simulate 5 minutes of clock time in CI.

## Expected runtime impact (measured on-device in the release checklist)

- **Before Phase 4:** every 60s, `HomeScreen` re-rendered, recreating `vegDrops`/`vegFeatured`/`vegRestaurants` (new array refs), triggering a full FlatList reconciliation. `RestaurantCard` (memoized) skipped re-render on unchanged props but the FlatList still walked the list.
- **After Phase 4:** the 60s tick lives inside `SurplusRail` only. `HomeScreen` does not re-render on tick. The vertical restaurants FlatList is untouched.
- No new backend load, no new network calls. Purely a client-side stability win.

## Byte-compat + regression status

- Backend suite: 81 passed (no changes to backend code — re-run to confirm).
- `git diff backend/` for this phase: **empty**.
- No new npm packages installed; adapter contract unchanged.
