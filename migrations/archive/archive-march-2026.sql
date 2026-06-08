-- ===========================================================
-- Manual archive: March 2026 scores → Hall of Fame
-- All boundaries expressed in Eastern time (America/New_York)
-- ===========================================================

-- Step 1: Preview winners (DRY RUN — inspect output before running Steps 2 & 3)
SELECT DISTINCT ON (operation_type)
  player_name,
  score,
  operation_type,
  3 AS month,
  2026 AS year
FROM leaderboard_scores
WHERE created_at >= ('2026-03-01 00:00:00' AT TIME ZONE 'America/New_York')
  AND created_at < ('2026-04-01 00:00:00' AT TIME ZONE 'America/New_York')
ORDER BY operation_type, score ASC, created_at ASC;


-- Step 2: Insert winners into hall_of_fame
-- ON CONFLICT DO NOTHING prevents duplicates — safe to re-run
INSERT INTO hall_of_fame (player_name, score, operation_type, month, year)
SELECT DISTINCT ON (operation_type)
  player_name,
  score,
  operation_type,
  3 AS month,
  2026 AS year
FROM leaderboard_scores
WHERE created_at >= ('2026-03-01 00:00:00' AT TIME ZONE 'America/New_York')
  AND created_at < ('2026-04-01 00:00:00' AT TIME ZONE 'America/New_York')
ORDER BY operation_type, score ASC, created_at ASC
ON CONFLICT (operation_type, year, month) DO NOTHING;


-- Step 3: Delete March 2026 scores (keeps April 2026+ intact)
DELETE FROM leaderboard_scores
WHERE created_at >= ('2026-03-01 00:00:00' AT TIME ZONE 'America/New_York')
  AND created_at < ('2026-04-01 00:00:00' AT TIME ZONE 'America/New_York');


-- Verification: Confirm winners were inserted
SELECT * FROM hall_of_fame WHERE year = 2026 AND month = 3;

-- Verification: Confirm no March scores remain
SELECT count(*) AS remaining_mar_scores
FROM leaderboard_scores
WHERE created_at >= ('2026-03-01 00:00:00' AT TIME ZONE 'America/New_York')
  AND created_at < ('2026-04-01 00:00:00' AT TIME ZONE 'America/New_York');
