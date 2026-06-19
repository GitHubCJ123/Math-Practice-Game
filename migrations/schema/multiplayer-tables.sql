-- ============================================
-- SUPABASE SCHEMA: MULTIPLAYER (rooms, queue, rate limits, polls)
-- Run this in your Supabase SQL Editor, THEN run multiplayer-functions.sql.
--
-- Moves all previously in-memory, per-lambda state into Postgres so that
-- serverless instances share one source of truth (fixes the multiplayer
-- "stuck on waiting for opponents" split-brain). Designed for tournament
-- scale (20-30 players/room): per-player rows make "mark finished" a 1-row
-- UPDATE and "all finished?" a COUNT, both made atomic by the plpgsql
-- functions in multiplayer-functions.sql.
-- ============================================

-- ============================================
-- TABLE: multiplayer_rooms (one row per room)
-- Low-churn data (settings/questions/teams/rematch) lives as JSONB here;
-- hot per-player data lives in the child tables below.
-- ============================================
CREATE TABLE IF NOT EXISTS multiplayer_rooms (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  host_id         TEXT NOT NULL,
  game_state      TEXT NOT NULL DEFAULT 'waiting'
                    CHECK (game_state IN ('waiting', 'countdown', 'playing', 'finished')),
  settings        JSONB NOT NULL,
  questions       JSONB NOT NULL DEFAULT '[]'::jsonb,
  teams           JSONB NOT NULL DEFAULT '[]'::jsonb,
  rematch_state   JSONB,
  game_start_time BIGINT,            -- epoch milliseconds (mirrors Date.now())
  is_quick_match  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour'
);

CREATE INDEX IF NOT EXISTS idx_mp_rooms_code ON multiplayer_rooms(code);
CREATE INDEX IF NOT EXISTS idx_mp_rooms_expires_at ON multiplayer_rooms(expires_at);

-- ============================================
-- TABLE: multiplayer_players (one row per player in a room)
-- ============================================
CREATE TABLE IF NOT EXISTS multiplayer_players (
  room_id       TEXT NOT NULL REFERENCES multiplayer_rooms(id) ON DELETE CASCADE,
  player_id     TEXT NOT NULL,
  name          TEXT NOT NULL,
  is_host       BOOLEAN NOT NULL DEFAULT FALSE,
  is_ready      BOOLEAN NOT NULL DEFAULT FALSE,
  connected     BOOLEAN NOT NULL DEFAULT TRUE,
  team_id       TEXT,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_players_room ON multiplayer_players(room_id);

-- ============================================
-- TABLE: multiplayer_player_states (one row per player's in-game state)
-- Seeded when the game starts. "all finished?" = COUNT(*) FILTER (NOT finished).
-- ============================================
CREATE TABLE IF NOT EXISTS multiplayer_player_states (
  room_id          TEXT NOT NULL REFERENCES multiplayer_rooms(id) ON DELETE CASCADE,
  player_id        TEXT NOT NULL,
  name             TEXT NOT NULL,
  answers          JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_question INTEGER NOT NULL DEFAULT 0,
  finished         BOOLEAN NOT NULL DEFAULT FALSE,
  finish_time      BIGINT,           -- ms from game start
  score            INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_player_states_room ON multiplayer_player_states(room_id);

-- ============================================
-- TABLE: multiplayer_queue (quick-match waiting list)
-- ============================================
CREATE TABLE IF NOT EXISTS multiplayer_queue (
  player_id  TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  operation  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_queue_operation ON multiplayer_queue(operation, created_at);

-- ============================================
-- TABLE: rate_limits (fixed-window counters; replaces in-memory limiters)
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket     TEXT PRIMARY KEY,        -- `${key}:${windowStart}`
  count      INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires_at ON rate_limits(expires_at);

-- ============================================
-- TABLE: poll_state (server snapshot of the active admin poll for late joiners)
-- ============================================
CREATE TABLE IF NOT EXISTS poll_state (
  id         TEXT PRIMARY KEY,        -- pollId
  poll       JSONB NOT NULL,
  tallies    JSONB NOT NULL DEFAULT '{}'::jsonb,
  closed     BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at  TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- All of these tables are server-only: the client never reads them directly
-- (everything flows through /api with the service-role key). Enable RLS and
-- grant ONLY the service role, mirroring leaderboard_scores/hall_of_fame.
-- ============================================
ALTER TABLE multiplayer_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE multiplayer_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE multiplayer_player_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE multiplayer_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_state ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'multiplayer_rooms', 'multiplayer_players', 'multiplayer_player_states',
    'multiplayer_queue', 'rate_limits', 'poll_state'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service role full access" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "service role full access" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
