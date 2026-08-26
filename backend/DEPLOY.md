# Deploy Runbook — Perfectly Good backend

## After every deploy

Run these two idempotent scripts before restarting the API. Order matters — indexes first, so migrations aren't blocked by full-collection scans:

```bash
cd /app/backend
python -m scripts.migrate_indexes    # idempotent, background=True
python -m scripts.migrate_v2         # idempotent (schema backfill, staff seed)
sudo supervisorctl restart backend
```

Both scripts accept `--dry-run` to preview changes without touching Mongo:

```bash
python -m scripts.migrate_indexes --dry-run
python -m scripts.migrate_v2 --dry-run
```

## Why they're not on the app startup path

Phase 2 (2026-08) relocated `create_index` and `migrate_v2` out of `server.py`'s startup handler so:

- **App boot is side-effect-free.** A cold start hitting an empty DB no longer builds ~20 indexes synchronously and doesn't scan every collection.
- **Indexes are managed in one place.** All specs live in `scripts/migrate_indexes.py`. Do not add `create_index` back to `server.py`.
- **Migrations are explicit and auditable.** Every schema change goes through `scripts/migrate_v2.py`; running it is a deliberate operator step, not a side-effect of a redeploy.

## Adding a new index

1. Append a tuple to `INDEX_SPECS` in `scripts/migrate_indexes.py`.
2. Run `python -m scripts.migrate_indexes --dry-run` locally, confirm the `[DRY]` output.
3. Run without `--dry-run` against staging, then production.
4. **Never** add `db.<col>.create_index(...)` inside `server.py` handlers or startup.

## Adding a new data migration

Add a new `_step_XXX(db, now, dry_run)` coroutine to `scripts/migrate_v2.py` and call it from `_run()`. Keep every step idempotent (guard with existence checks, use `$setOnInsert` where you can).

## Credentials

Seeded staff accounts and their passwords are listed in `/app/memory/test_credentials.md`. Rotate before shipping to production.
