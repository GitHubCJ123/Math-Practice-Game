# Database Migrations

SQL files for the Math Practice Game database. The current backend uses Supabase (Postgres). Azure SQL files are kept only for historical reference.

## Layout

```
migrations/
├── schema/         # Current Supabase schema — apply to a fresh database
│   ├── supabase-schema.sql    # Core tables: leaderboard_scores, hall_of_fame (+ RLS policies)
│   └── feedback-table.sql     # feedback table used by api/submit-feedback.ts
├── archive/        # One-off operational scripts run to archive past months
│   ├── archive-january-2026.sql
│   └── archive-march-2026.sql
└── legacy-azure/   # Historical Azure SQL scripts — no longer applied
    ├── add-indexes.sql
    └── azure-export-queries.sql
```

## Applying schema to a fresh Supabase project

Run the files in `schema/` in your Supabase SQL Editor, in this order:

1. `schema/supabase-schema.sql`
2. `schema/feedback-table.sql`

All `CREATE POLICY` statements are preceded by `DROP POLICY IF EXISTS`, so re-applying the schema files is safe and idempotent.

## Archive scripts

Files in `archive/` are point-in-time scripts that were used to archive a specific month's leaderboard scores into `hall_of_fame`. They are kept for auditability. The recurring archive job now runs automatically via `api/archive-scores.ts` (Vercel cron + a backup GitHub Actions workflow in `.github/workflows/archive-scores-cron.yml`).

## Legacy Azure SQL

Files in `legacy-azure/` reference the old Azure SQL backend (driven by the deleted `server.cjs`). They are retained for historical reference only — do not apply them to the Supabase database.
