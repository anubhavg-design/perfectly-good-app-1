# Release 1.0.3 — v1↔v2 List Rollout

**App version:** 1.0.3
**iOS `buildNumber`:** 1.0.3
**Android `versionCode`:** 137
**Backend:** phase-3 API (adds `GET /api/config`; v1 endpoints byte-compatible with 1.0.2).

## What's in 1.0.3

- **Remote config** (`GET /api/config`) with hard version gate — 1.0.2 clients can never receive `use_v2_lists=true`.
- **Adapter layer** (`src/api/adapter.ts`) unifies v1 bare-list and v2 envelope responses under one `Page<T>` interface. All list screens go through it.
- **Surplus screen infinite-scroll** — `PAGE_SIZE=10`, cursor-based, works in both v1 and v2 modes (v1 mode returns one big page as before; v2 paginates properly).
- **Home re-render fix** — extracted the surplus horizontal rail into `<SurplusRail/>` which owns its own 60s countdown tick. The vertical restaurants FlatList no longer receives `extraData={tick}` and no longer re-renders every minute.

This release is a **safe cutover** — shipping 1.0.3 does not change any user-visible behavior until you deliberately raise `v2_lists_rollout_pct` on the backend. The 1.0.2 store binary is protected by a hard version gate.

---

## 1. EAS build commands

Run from `/app/frontend`. Confirm you're logged in first: `eas whoami`.

### Preview builds — TestFlight (iOS) + Play Internal (Android)

```bash
cd /app/frontend

# iOS preview → TestFlight
eas build --profile preview --platform ios --non-interactive

# Android preview (APK/AAB per eas.json) → Play Internal
eas build --profile preview --platform android --non-interactive
```

### Store submission (after TestFlight/Internal QA passes)

```bash
# Bump-and-ship iOS via app-bundle profile
eas build --profile app-bundle --platform ios --non-interactive
eas submit  --profile production --platform ios --latest

# Bump-and-ship Android
eas build --profile app-bundle --platform android --non-interactive
eas submit  --profile production --platform android --latest
```

`eas.json` `production.autoIncrement=true` handles per-build numbering. The semantic version bump (`1.0.2 → 1.0.3`) and Android `versionCode` bump (`136 → 137`) are already in `app.json`.

---

## 2. Device test checklist

### Pre-flight — v1 mode on 1.0.3 (`v2_lists_rollout_pct = 0`)

- [ ] App boots, home tab renders restaurants + surplus + featured rails
- [ ] Pull-to-refresh works on home
- [ ] Restaurant detail loads, menu shows, add-to-cart works
- [ ] Multi-item cart: add 3 items from one vendor, quantity changes, remove item
- [ ] Single-vendor conflict prompt appears if adding from a different vendor
- [ ] Checkout → Razorpay flow completes on a test order
- [ ] Order appears in "My Orders", pickup code visible
- [ ] Browse Deals screen infinite-scrolls to page 3+
- [ ] Surplus screen renders full list (in v1 mode this is a single page; in v2 mode it paginates in batches of 10)
- [ ] Leave home tab open for 3+ minutes. Countdown timers on the **surplus rail** continue updating (proves tick still fires); the vertical **restaurants list** does NOT flicker/re-render (proves Phase 4 storm fix)

### v2 mode — temporarily set `v2_lists_rollout_pct = 100` on staging DB

- [ ] Repeat the entire pre-flight checklist. Everything must behave identically to the user.
- [ ] Confirm via network inspector (Flipper / Charles / Reactotron) that the app is calling `/api/v2/*` endpoints, not `/api/*`.
- [ ] **Surplus screen: scroll past 3 pages with `sort_by=price`. Confirm items load in batches of 10, no duplicates, footer shows "You've seen all deals" when list exhausts.**
- [ ] Force-close app, reopen: config persists (from AsyncStorage `pg_config_v1`), no re-fetch flash.

### Kill switch drill

- [ ] With app open and on v2, flip `v2_lists_rollout_pct` back to `0` on the DB (see §4 command).
- [ ] Background the app for 5+ min, foreground it.
- [ ] Confirm the next list fetch hits `/api/*` (v1), not `/api/v2/*`. **This proves the kill switch works.**

---

## 3. Where to find the config-flag on the wire

Every request from the 1.0.3 client now carries:

```
X-App-Version: 1.0.3
X-Client-Id: <persistent UUID from AsyncStorage 'pg_client_id_v1'>
Authorization: Bearer <jwt>   (only when logged in)
```

These are additive and safe — v1 endpoints ignore them.

The client fetches `GET /api/config` at boot (background, non-blocking) and again every 5 min while foregrounded. The backend returns:

```json
{
  "use_v2_lists": false,
  "cache_ttl_seconds": 300,
  "min_supported_version": "1.0.0",
  "server_time": "2026-08-25T18:55:12.345Z"
}
```

- Any failure path (500, timeout, malformed) → client stays on v1.
- 1.0.2 clients (missing / lower `X-App-Version`) always receive `use_v2_lists=false` regardless of rollout %.

---

## 4. Rollout runbook

**Golden rule:** raise the % in stages. Every change takes effect within one config-refresh cycle (default 5 min per client).

Connect to the production Mongo (Atlas cluster) and update the single `settings` document:

```javascript
// mongosh — connected to the production DB, once TestFlight + Play Internal pass
use perfectly_good

// Sanity: what's set today?
db.settings.findOne({ _id: "platform" }, { v2_lists_rollout_pct: 1, config_cache_ttl_seconds: 1 })

// Enable for 10% of 1.0.3 clients (canary)
db.settings.updateOne({ _id: "platform" }, { $set: { v2_lists_rollout_pct: 10 } })

// Wait 30 min, watch APM/error rate. If green:
db.settings.updateOne({ _id: "platform" }, { $set: { v2_lists_rollout_pct: 50 } })

// Wait another hour. If still green:
db.settings.updateOne({ _id: "platform" }, { $set: { v2_lists_rollout_pct: 100 } })
```

### Kill switch (drop everyone back to v1)

```javascript
db.settings.updateOne({ _id: "platform" }, { $set: { v2_lists_rollout_pct: 0 } })
```

All clients revert on their next config refresh (≤ 5 min). No app update needed.

### Emergency: raise the min-supported version

Doesn't exist yet but the shape is in place — if we ever need to force a store update, edit `min_supported_version` in `/api/config` and add client-side handling. Not part of 1.0.3.

---

## 5. Post-deploy scripts (unchanged from Phase 2)

```bash
cd /app/backend
python -m scripts.migrate_indexes    # idempotent, background=True
python -m scripts.migrate_v2         # idempotent; now also adds the two new settings keys if missing
sudo supervisorctl restart backend
```

The `migrate_v2` script now ensures `v2_lists_rollout_pct=0` (safe default) and `config_cache_ttl_seconds=300` exist on the settings doc. It never overwrites values you've deliberately raised.
