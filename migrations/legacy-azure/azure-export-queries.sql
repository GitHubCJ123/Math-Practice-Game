-- ============================================
-- AZURE SQL DATA EXPORT QUERIES
-- Run these in Azure Data Studio or SSMS to export your data
-- ============================================

-- Export LeaderboardScores table
-- Copy the results to a CSV file or use for INSERT statements
SELECT 
  PlayerName as player_name,
  Score as score,
  OperationType as operation_type,
  CreatedAt as created_at
FROM LeaderboardScores
ORDER BY CreatedAt DESC;

-- Export HallOfFame table
SELECT 
  PlayerName as  player_name,
  Score as score,
  OperationType as operation_type,
  Month as month,
  Year as year
FROM HallOfFame
ORDER BY Year DESC, Month DESC;

-- ============================================
-- IMPORT INTO SUPABASE
-- After exporting, you can import via:
-- 1. Supabase Dashboard → Table Editor → Import CSV
-- 2. Or use INSERT statements like below
-- ============================================

-- Example INSERT for leaderboard_scores:
-- INSERT INTO leaderboard_scores (player_name, score, operation_type, created_at)
-- VALUES 
--   ('Player1', 12345, 'multiplication', '2026-01-15T10:30:00Z'),
--   ('Player2', 23456, 'division', '2026-01-14T09:15:00Z');

-- Example INSERT for hall_of_fame:
-- INSERT INTO hall_of_fame (player_name, score, operation_type, month, year)
-- VALUES 
--   ('Champion1', 9876, 'multiplication', 12, 2025),
--   ('Champion2', 8765, 'division', 12, 2025);
