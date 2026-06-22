-- ============================================
-- OPTIONAL: schedule tournament cleanup via pg_cron
-- Run AFTER tournament-functions.sql. pg_cron is available on Supabase Free.
--
-- If `CREATE EXTENSION pg_cron` errors on permissions, enable "pg_cron" first
-- from the Supabase dashboard (Database -> Extensions), then run the schedule.
--
-- Tournaments expire 6 hours after they are CREATED (tournaments.expires_at);
-- FINISHING a tournament does NOT change that timer. Nothing deletes a finished
-- tournament right away — it lingers until it is 6h old, then this job removes
-- it (cascading to its participants/teams/matches/states). Not strictly required
-- (tt_cleanup_expired() can also be called on demand); this just keeps the
-- tables tidy automatically.
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any previous schedule with the same name, then (re)create it.
SELECT cron.unschedule('tt-cleanup-expired')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tt-cleanup-expired');

SELECT cron.schedule(
  'tt-cleanup-expired',
  '*/15 * * * *',                -- every 15 minutes
  $$ SELECT tt_cleanup_expired(); $$
);
