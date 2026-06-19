-- ============================================
-- OPTIONAL: schedule multiplayer cleanup via pg_cron
-- Run AFTER multiplayer-functions.sql. pg_cron is available on Supabase Free.
--
-- If `CREATE EXTENSION pg_cron` errors on permissions, enable "pg_cron" first
-- from the Supabase dashboard (Database -> Extensions), then run the schedule.
--
-- Not required: mp_cleanup_expired() can also be called opportunistically, and
-- expired rooms are already filtered/ignored on read. This just keeps the tables
-- tidy automatically.
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any previous schedule with the same name, then (re)create it.
SELECT cron.unschedule('mp-cleanup-expired')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mp-cleanup-expired');

SELECT cron.schedule(
  'mp-cleanup-expired',
  '*/5 * * * *',                 -- every 5 minutes
  $$ SELECT mp_cleanup_expired(); $$
);
