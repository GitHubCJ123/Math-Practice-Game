-- ============================================
-- SUPABASE SCHEMA FOR MATH PRACTICE GAME
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: LeaderboardScores
-- Stores current month's scores
-- ============================================
CREATE TABLE IF NOT EXISTS leaderboard_scores (
  id BIGSERIAL PRIMARY KEY,
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  operation_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for LeaderboardScores
CREATE INDEX IF NOT EXISTS idx_leaderboard_operation_created 
  ON leaderboard_scores(operation_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_player_operation 
  ON leaderboard_scores(player_name, operation_type);

CREATE INDEX IF NOT EXISTS idx_leaderboard_created_at 
  ON leaderboard_scores(created_at);

-- ============================================
-- TABLE: HallOfFame
-- Stores monthly champions (archived winners)
-- ============================================
CREATE TABLE IF NOT EXISTS hall_of_fame (
  id BIGSERIAL PRIMARY KEY,
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  operation_type TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020)
);

-- Indexes for HallOfFame
CREATE INDEX IF NOT EXISTS idx_hof_operation_year_month 
  ON hall_of_fame(operation_type, year DESC, month DESC);

CREATE INDEX IF NOT EXISTS idx_hof_year_month 
  ON hall_of_fame(year DESC, month DESC);

-- Unique constraint to prevent duplicate entries for same operation/month/year
CREATE UNIQUE INDEX IF NOT EXISTS idx_hof_unique_winner
  ON hall_of_fame(operation_type, year, month);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on both tables
ALTER TABLE leaderboard_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE hall_of_fame ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to read leaderboard scores
CREATE POLICY "Allow public read on leaderboard_scores"
  ON leaderboard_scores
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Policy: Allow service role to insert/update/delete leaderboard scores
CREATE POLICY "Allow service role full access on leaderboard_scores"
  ON leaderboard_scores
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Allow anyone to read hall of fame
CREATE POLICY "Allow public read on hall_of_fame"
  ON hall_of_fame
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Policy: Allow service role to insert/update/delete hall of fame
CREATE POLICY "Allow service role full access on hall_of_fame"
  ON hall_of_fame
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- HELPFUL QUERIES FOR DATA MIGRATION
-- ============================================

-- After importing your data from Azure, you can verify counts:
-- SELECT COUNT(*) FROM leaderboard_scores;
-- SELECT COUNT(*) FROM hall_of_fame;

-- To import data, you can use Supabase's CSV import feature
-- or INSERT statements. Example:
--
-- INSERT INTO leaderboard_scores (player_name, score, operation_type, created_at)
-- VALUES ('PlayerName', 12345, 'multiplication', '2025-01-15T10:30:00Z');
--
-- INSERT INTO hall_of_fame (player_name, score, operation_type, month, year)
-- VALUES ('ChampionName', 9876, 'multiplication', 12, 2025);
