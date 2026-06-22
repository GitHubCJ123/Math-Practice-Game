-- ============================================
-- SUPABASE SCHEMA: TOURNAMENT MODE (single-elimination brackets)
-- Run this in your Supabase SQL Editor, THEN run tournament-functions.sql.
--
-- Tournament mode is a meta-layer over the existing question engine: an
-- organizer (non-playing host) gathers 2-32 participants by code, seeds a
-- single-elimination bracket, and runs it round by round. Each bracket match is
-- a 2-participant race over the same questions; higher score wins (ties broken
-- by faster finish). A bracket partitions players into 2-person matches, so the
-- realtime fan-out stays O(1) per match instead of the O(N^2) a single large
-- room would incur.
--
-- State lives here (not in the multiplayer_rooms tables) so the bracket, live
-- scores, and per-question progress survive serverless cold starts and client
-- refreshes — durable analytics is an explicit requirement of this feature.
-- ============================================

-- ============================================
-- TABLE: tournaments (one row per tournament)
-- `settings` holds the DEFAULT round settings (operation/selectedNumbers/
-- questionCount/timeLimit). Per-round overrides live on tournament_matches.
-- ============================================
CREATE TABLE IF NOT EXISTS tournaments (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  organizer_id  TEXT NOT NULL,
  name          TEXT NOT NULL,
  format        TEXT NOT NULL DEFAULT 'individual'
                  CHECK (format IN ('individual', 'teams')),
  status        TEXT NOT NULL DEFAULT 'lobby'
                  CHECK (status IN ('lobby', 'seeding', 'running', 'finished')),
  settings      JSONB NOT NULL,                       -- default round settings
  round_settings JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { "<round>": settings } overrides
  current_round INTEGER NOT NULL DEFAULT 0,
  champion_id   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '6 hours'
);

CREATE INDEX IF NOT EXISTS idx_tt_code ON tournaments(code);
CREATE INDEX IF NOT EXISTS idx_tt_expires_at ON tournaments(expires_at);

-- ============================================
-- TABLE: tournament_participants (one row per entrant)
-- For 'individual' format, participant_id is a playerId. For 'teams', it is a
-- teamId (team membership is carried in the JSONB assembled by tt_*).
-- ============================================
CREATE TABLE IF NOT EXISTS tournament_participants (
  tournament_id    TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  participant_id   TEXT NOT NULL,
  name             TEXT NOT NULL,
  seed             INTEGER,
  eliminated_round INTEGER,            -- NULL = still alive
  connected        BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tournament_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_tt_participants_tournament
  ON tournament_participants(tournament_id);

-- Team bracket support: which team this player is on ('teams' format only).
ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS team_id TEXT;

-- ============================================
-- TABLE: tournament_teams (one row per team, 'teams' format only)
-- The bracket is seeded over teams; tournament_matches.p1_id/p2_id hold team_ids.
-- ============================================
CREATE TABLE IF NOT EXISTS tournament_teams (
  tournament_id    TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id          TEXT NOT NULL,
  name             TEXT NOT NULL,
  seed             INTEGER,
  eliminated_round INTEGER,            -- NULL = still alive
  PRIMARY KEY (tournament_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_tt_teams_tournament
  ON tournament_teams(tournament_id);

-- ============================================
-- TABLE: tournament_matches (one row per bracket slot)
-- A NULL p1_id/p2_id is an empty seat (a bye in round 1, or an unresolved
-- feeder in later rounds). `round_settings` overrides the tournament default for
-- that round (the organizer can change the operation per round).
-- ============================================
CREATE TABLE IF NOT EXISTS tournament_matches (
  id             TEXT PRIMARY KEY,
  tournament_id  TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round          INTEGER NOT NULL,
  slot           INTEGER NOT NULL,     -- 0-based position within the round
  p1_id          TEXT,
  p2_id          TEXT,
  p1_score       INTEGER,
  p2_score       INTEGER,
  p1_finish_ms   BIGINT,
  p2_finish_ms   BIGINT,
  winner_id      TEXT,
  state          TEXT NOT NULL DEFAULT 'pending'
                   CHECK (state IN ('pending', 'playing', 'finished')),
  questions      JSONB NOT NULL DEFAULT '[]'::jsonb,
  round_settings JSONB,
  started_at     BIGINT,               -- epoch ms when the round started
  UNIQUE (tournament_id, round, slot)
);

CREATE INDEX IF NOT EXISTS idx_tt_matches_tournament_round
  ON tournament_matches(tournament_id, round);

-- ============================================
-- TABLE: tournament_match_states (per-participant in-match progress)
-- Powers the organizer's live analytics and survives client refresh. Seeded
-- when a round starts; updated on every progress ping and on submit.
-- ============================================
CREATE TABLE IF NOT EXISTS tournament_match_states (
  match_id         TEXT NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
  tournament_id    TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  participant_id   TEXT NOT NULL,
  name             TEXT NOT NULL,
  answers          JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_question INTEGER NOT NULL DEFAULT 0,
  finished         BOOLEAN NOT NULL DEFAULT FALSE,
  finish_ms        BIGINT,
  score            INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_tt_match_states_tournament
  ON tournament_match_states(tournament_id);

-- Which side of the match this participant plays for ('p1' or 'p2'). For
-- 'individual' it mirrors p1_id/p2_id; for 'teams' it groups a team's players so
-- scores can be aggregated per side.
ALTER TABLE tournament_match_states ADD COLUMN IF NOT EXISTS side TEXT;

-- ============================================
-- ROW LEVEL SECURITY
-- Server-only, mirroring the multiplayer tables: the client never touches these
-- directly (everything flows through /api with the service-role key). Enable
-- RLS and grant ONLY the service role.
-- ============================================
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_match_states ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tournaments', 'tournament_participants', 'tournament_teams',
    'tournament_matches', 'tournament_match_states'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service role full access" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "service role full access" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
