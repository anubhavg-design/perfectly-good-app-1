"""Standalone CLI scripts for post-deploy migrations.

Nothing in this package is imported at API boot. Run manually:

    cd /app/backend
    python -m scripts.migrate_indexes    # idempotent
    python -m scripts.migrate_v2         # idempotent
"""
