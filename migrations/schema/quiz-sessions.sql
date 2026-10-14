-- ============================================
-- SUPABASE SCHEMA: SOLO QUIZ SESSIONS (leaderboard anti-cheat)
-- Run this in your Supabase SQL Editor AFTER supabase-schema.sql.
-- Must be applied BEFORE deploying the matching api/submit-score.ts.
--
-- Every leaderboard-eligible solo quiz is issued by the server
-- (api/submit-score.ts, action "start"). The server keeps the questions and
-- answers, measures the run time itself, re-grades the answers ("finish"),
-- and only then allows ONE score from that run to reach leaderboard_scores
-- ("submit"). A score can no longer be posted without actually playing a
-- server-issued quiz.
-- ============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() (built in on PG13+)

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type   TEXT NOT NULL,
  questions        JSONB NOT NULL,          -- includes answers; never sent back after finish
  issued_at_ms     BIGINT NOT NULL,         -- epoch ms (server Date.now()) when questions were issued
  finished_at_ms   BIGINT,                  -- epoch ms when the finished run reached the server
  score_ms         INTEGER,                 -- server-verified time; NULL unless the run was perfect + plausible
  submitted_at     TIMESTAMPTZ,             -- set once the score is written to leaderboard_scores
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '2 hours'
);

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_expires_at ON quiz_sessions(expires_at);

-- Server-only table: no public access, service role only (like rate_limits).
ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access" ON quiz_sessions;
CREATE POLICY "service role full access"
  ON quiz_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Expired sessions are purged on every new quiz start (api/submit-score.ts)
-- and by the monthly api/archive-scores job, so no extra scheduling is needed.
