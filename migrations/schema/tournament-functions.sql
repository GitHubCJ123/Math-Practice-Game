-- ============================================
-- SUPABASE FUNCTIONS: TOURNAMENT MODE
-- Run AFTER tournament-tables.sql.
--
-- Mirrors the mp_* design: every concurrent mutation runs through an atomic
-- plpgsql function and returns the full tournament object already shaped to
-- match shared/types.ts (camelCase). Bracket STRUCTURE math (seeding, byes,
-- advancement pairings) is computed in TypeScript (shared/bracket.ts, unit
-- tested) and handed to the seed/advance functions as concrete rows — those are
-- organizer-only serial operations, so JS-compute + SQL-persist is safe. The
-- concurrent paths (join, submit, progress) are fully atomic here.
-- ============================================

CREATE OR REPLACE FUNCTION tt_now_ms() RETURNS BIGINT
LANGUAGE sql STABLE AS $$ SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT; $$;

-- 6-char join code, excluding confusing characters. Uniqueness is enforced by
-- the UNIQUE constraint + retry loop in tt_create_tournament.
CREATE OR REPLACE FUNCTION tt_gen_code() RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code  TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..6 LOOP
    v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
  END LOOP;
  RETURN v_code;
END;
$$;

-- Assemble the full Tournament object in the shape shared/types.ts expects.
-- Questions are intentionally omitted (heavy; delivered via the round-started
-- event and the match runner instead). Returns NULL if not found.
CREATE OR REPLACE FUNCTION tt_tournament_json(p_id TEXT) RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_t tournaments;
BEGIN
  SELECT * INTO v_t FROM tournaments WHERE id = p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'id', v_t.id,
    'code', v_t.code,
    'organizerId', v_t.organizer_id,
    'name', v_t.name,
    'format', v_t.format,
    'status', v_t.status,
    'currentRound', v_t.current_round,
    'championId', v_t.champion_id,
    'settings', v_t.settings,
    'roundSettings', v_t.round_settings,
    'participants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'participantId', participant_id,
        'name', name,
        'seed', seed,
        'eliminatedRound', eliminated_round,
        'connected', connected,
        'teamId', team_id
      ) ORDER BY seed NULLS LAST, joined_at)
      FROM tournament_participants WHERE tournament_id = p_id), '[]'::jsonb),
    'teams', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'teamId', t.team_id,
        'name', t.name,
        'seed', t.seed,
        'eliminatedRound', t.eliminated_round,
        'memberIds', COALESCE((
          SELECT jsonb_agg(p.participant_id ORDER BY p.joined_at)
          FROM tournament_participants p
          WHERE p.tournament_id = p_id AND p.team_id = t.team_id), '[]'::jsonb)
      ) ORDER BY t.seed NULLS LAST, t.team_id)
      FROM tournament_teams t WHERE t.tournament_id = p_id), '[]'::jsonb),
    'matches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'round', round,
        'slot', slot,
        'p1Id', p1_id,
        'p2Id', p2_id,
        'p1Score', p1_score,
        'p2Score', p2_score,
        'p1FinishMs', p1_finish_ms,
        'p2FinishMs', p2_finish_ms,
        'winnerId', winner_id,
        'state', state,
        'roundSettings', round_settings,
        'startedAt', started_at
      ) ORDER BY round, slot)
      FROM tournament_matches WHERE tournament_id = p_id), '[]'::jsonb)
  );
END;
$$;

-- Live per-match progress snapshot for the organizer dashboard (current question
-- + score for every participant in every match of the given round).
CREATE OR REPLACE FUNCTION tt_live_states(p_id TEXT, p_round INT) RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'matchId', s.match_id,
    'participantId', s.participant_id,
    'name', s.name,
    'currentQuestion', s.current_question,
    'score', s.score,
    'finished', s.finished,
    'finishMs', s.finish_ms
  )), '[]'::jsonb)
  FROM tournament_match_states s
  JOIN tournament_matches m ON m.id = s.match_id
  WHERE s.tournament_id = p_id AND m.round = p_round;
$$;

-- ---------- lifecycle ----------

CREATE OR REPLACE FUNCTION tt_create_tournament(
  p_organizer_id TEXT, p_name TEXT, p_format TEXT, p_settings JSONB
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_id       TEXT := 'tt_' || replace(gen_random_uuid()::text, '-', '');
  v_code     TEXT;
  v_attempts INT := 0;
BEGIN
  LOOP
    v_code := tt_gen_code();
    BEGIN
      INSERT INTO tournaments (id, code, organizer_id, name, format, status, settings)
      VALUES (v_id, v_code, p_organizer_id, p_name, COALESCE(p_format, 'individual'), 'lobby', p_settings);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempts := v_attempts + 1;
      IF v_attempts > 10 THEN RAISE; END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('tournament', tt_tournament_json(v_id));
END;
$$;

CREATE OR REPLACE FUNCTION tt_join_tournament(p_code TEXT, p_participant_id TEXT, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_t     tournaments;
  v_count INT;
BEGIN
  SELECT * INTO v_t FROM tournaments WHERE code = upper(p_code) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Tournament not found');
  END IF;
  IF v_t.status <> 'lobby' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Tournament has already started');
  END IF;

  -- Re-join is idempotent (refresh name, mark connected).
  IF EXISTS (SELECT 1 FROM tournament_participants
             WHERE tournament_id = v_t.id AND participant_id = p_participant_id) THEN
    UPDATE tournament_participants SET name = p_name, connected = TRUE
      WHERE tournament_id = v_t.id AND participant_id = p_participant_id;
    RETURN jsonb_build_object('ok', TRUE, 'tournamentId', v_t.id, 'tournament', tt_tournament_json(v_t.id));
  END IF;

  SELECT count(*) INTO v_count FROM tournament_participants WHERE tournament_id = v_t.id;
  IF v_count >= 32 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Tournament is full (32 max)');
  END IF;

  INSERT INTO tournament_participants (tournament_id, participant_id, name, seed)
    VALUES (v_t.id, p_participant_id, p_name, v_count + 1);

  RETURN jsonb_build_object('ok', TRUE, 'tournamentId', v_t.id, 'tournament', tt_tournament_json(v_t.id));
END;
$$;

-- Voluntary leave: removed in the lobby; forfeits (eliminated) once running.
CREATE OR REPLACE FUNCTION tt_leave_tournament(p_tournament_id TEXT, p_participant_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_t tournaments;
BEGIN
  SELECT * INTO v_t FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Tournament not found'); END IF;

  IF v_t.status IN ('lobby', 'seeding') THEN
    DELETE FROM tournament_participants WHERE tournament_id = p_tournament_id AND participant_id = p_participant_id;
  ELSE
    UPDATE tournament_participants SET eliminated_round = v_t.current_round, connected = FALSE
      WHERE tournament_id = p_tournament_id AND participant_id = p_participant_id;
    UPDATE tournament_match_states SET finished = TRUE, score = 0, finish_ms = 0
      WHERE tournament_id = p_tournament_id AND participant_id = p_participant_id AND finished = FALSE;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'tournament', tt_tournament_json(p_tournament_id));
END;
$$;

-- Organizer removes a participant. Deleted in lobby/seeding; forfeited while running.
CREATE OR REPLACE FUNCTION tt_kick_participant(p_tournament_id TEXT, p_organizer_id TEXT, p_target TEXT)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_t tournaments;
  v_match_id TEXT;
BEGIN
  SELECT * INTO v_t FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Tournament not found'); END IF;
  IF v_t.organizer_id <> p_organizer_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only the organizer can remove participants');
  END IF;

  IF v_t.status IN ('lobby', 'seeding') THEN
    DELETE FROM tournament_participants
      WHERE tournament_id = p_tournament_id AND participant_id = p_target;
  ELSE
    -- Forfeit: eliminate and finish any live match state at 0, then resolve the
    -- affected match so the opponent advances.
    UPDATE tournament_participants SET eliminated_round = v_t.current_round, connected = FALSE
      WHERE tournament_id = p_tournament_id AND participant_id = p_target;

    FOR v_match_id IN
      SELECT match_id FROM tournament_match_states
      WHERE tournament_id = p_tournament_id AND participant_id = p_target AND finished = FALSE
    LOOP
      UPDATE tournament_match_states SET finished = TRUE, score = 0, finish_ms = 0
        WHERE match_id = v_match_id AND participant_id = p_target;
      PERFORM tt_resolve_match(v_match_id);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'targetId', p_target, 'tournament', tt_tournament_json(p_tournament_id));
END;
$$;

-- Organizer forms teams from joined players ('teams' format). Replaces any
-- existing teams + a seeded bracket. p_teams = [{teamId, name, memberIds:[...]}].
CREATE OR REPLACE FUNCTION tt_form_teams(p_tournament_id TEXT, p_organizer_id TEXT, p_teams JSONB)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_t    tournaments;
  v_team JSONB;
  v_mid  TEXT;
  v_i    INT := 0;
BEGIN
  SELECT * INTO v_t FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Tournament not found'); END IF;
  IF v_t.organizer_id <> p_organizer_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only the organizer can form teams');
  END IF;
  IF v_t.status NOT IN ('lobby', 'seeding') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Teams are locked once the bracket starts');
  END IF;

  DELETE FROM tournament_matches WHERE tournament_id = p_tournament_id;
  DELETE FROM tournament_teams WHERE tournament_id = p_tournament_id;
  UPDATE tournament_participants SET team_id = NULL WHERE tournament_id = p_tournament_id;

  FOR v_team IN SELECT * FROM jsonb_array_elements(p_teams) LOOP
    v_i := v_i + 1;
    INSERT INTO tournament_teams (tournament_id, team_id, name, seed)
    VALUES (p_tournament_id, v_team->>'teamId', v_team->>'name', v_i);
    FOR v_mid IN SELECT jsonb_array_elements_text(v_team->'memberIds') LOOP
      UPDATE tournament_participants SET team_id = v_team->>'teamId'
        WHERE tournament_id = p_tournament_id AND participant_id = v_mid;
    END LOOP;
  END LOOP;

  UPDATE tournaments SET status = 'lobby' WHERE id = p_tournament_id;
  RETURN jsonb_build_object('ok', TRUE, 'tournament', tt_tournament_json(p_tournament_id));
END;
$$;

-- ---------- bracket ----------

-- Persist a freshly computed round-1 bracket (matches built in shared/bracket.ts).
-- Re-seedable until the first round starts. A bye (exactly one side present) is
-- auto-finished with that side as the winner.
CREATE OR REPLACE FUNCTION tt_seed_bracket(p_tournament_id TEXT, p_organizer_id TEXT, p_matches JSONB)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_t  tournaments;
  v_m  JSONB;
  v_id TEXT;
  v_p1 TEXT;
  v_p2 TEXT;
BEGIN
  SELECT * INTO v_t FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Tournament not found'); END IF;
  IF v_t.organizer_id <> p_organizer_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only the organizer can seed the bracket');
  END IF;
  IF v_t.status NOT IN ('lobby', 'seeding') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Bracket has already started');
  END IF;

  DELETE FROM tournament_matches WHERE tournament_id = p_tournament_id;

  FOR v_m IN SELECT * FROM jsonb_array_elements(p_matches) LOOP
    v_id := 'ttm_' || replace(gen_random_uuid()::text, '-', '');
    v_p1 := NULLIF(v_m->>'p1Id', '');
    v_p2 := NULLIF(v_m->>'p2Id', '');
    INSERT INTO tournament_matches (id, tournament_id, round, slot, p1_id, p2_id, state, winner_id)
    VALUES (
      v_id, p_tournament_id, (v_m->>'round')::int, (v_m->>'slot')::int, v_p1, v_p2,
      -- Only a fully-seated match is playable ('pending'). One seat = a bye and
      -- no seats = a dead slot; both auto-'finished' so they never block the
      -- round (a bye carries its lone player forward, a dead slot carries none).
      CASE WHEN v_p1 IS NOT NULL AND v_p2 IS NOT NULL THEN 'pending' ELSE 'finished' END,
      CASE WHEN v_p1 IS NOT NULL AND v_p2 IS NULL THEN v_p1
           WHEN v_p2 IS NOT NULL AND v_p1 IS NULL THEN v_p2
           ELSE NULL END
    );
  END LOOP;

  UPDATE tournaments SET status = 'seeding', current_round = 1 WHERE id = p_tournament_id;
  RETURN jsonb_build_object('ok', TRUE, 'tournament', tt_tournament_json(p_tournament_id));
END;
$$;

-- Set (or change) the settings for a round that has not started yet. This is how
-- the organizer changes the operation for the next round while the current one runs.
CREATE OR REPLACE FUNCTION tt_set_round_settings(
  p_tournament_id TEXT, p_organizer_id TEXT, p_round INT, p_settings JSONB
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_t tournaments;
BEGIN
  SELECT * INTO v_t FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Tournament not found'); END IF;
  IF v_t.organizer_id <> p_organizer_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only the organizer can change round settings');
  END IF;
  IF EXISTS (SELECT 1 FROM tournament_matches
             WHERE tournament_id = p_tournament_id AND round = p_round AND state <> 'pending') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'That round has already started');
  END IF;

  UPDATE tournaments
    SET round_settings = jsonb_set(round_settings, ARRAY[p_round::text], p_settings)
    WHERE id = p_tournament_id;

  RETURN jsonb_build_object('ok', TRUE, 'tournament', tt_tournament_json(p_tournament_id));
END;
$$;

-- ---------- in-round play ----------

-- Start every playable (two-seat, pending) match of a round: stamp questions +
-- settings, flip to 'playing', and seed per-participant state rows. Byes are
-- already finished.
CREATE OR REPLACE FUNCTION tt_start_round(
  p_tournament_id TEXT, p_organizer_id TEXT, p_round INT, p_questions JSONB, p_settings JSONB
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_t tournaments;
BEGIN
  SELECT * INTO v_t FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Tournament not found'); END IF;
  IF v_t.organizer_id <> p_organizer_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only the organizer can start a round');
  END IF;

  UPDATE tournament_matches
    SET state = 'playing', questions = p_questions, round_settings = p_settings, started_at = tt_now_ms()
    WHERE tournament_id = p_tournament_id AND round = p_round AND state = 'pending'
      AND p1_id IS NOT NULL AND p2_id IS NOT NULL;

  -- Seed per-participant state rows, tagged with the side they play for. Teams
  -- expand to every member of both sides; individual is just the two players.
  IF v_t.format = 'teams' THEN
    INSERT INTO tournament_match_states (match_id, tournament_id, participant_id, name, side)
    SELECT m.id, p_tournament_id, p.participant_id, p.name,
           CASE WHEN p.team_id = m.p1_id THEN 'p1' ELSE 'p2' END
    FROM tournament_matches m
    JOIN tournament_participants p
      ON p.tournament_id = p_tournament_id AND p.team_id IN (m.p1_id, m.p2_id)
    WHERE m.tournament_id = p_tournament_id AND m.round = p_round AND m.state = 'playing'
    ON CONFLICT (match_id, participant_id) DO NOTHING;
  ELSE
    INSERT INTO tournament_match_states (match_id, tournament_id, participant_id, name, side)
    SELECT m.id, p_tournament_id, x.pid, COALESCE(part.name, x.pid), x.side
    FROM tournament_matches m
    CROSS JOIN LATERAL (VALUES (m.p1_id, 'p1'), (m.p2_id, 'p2')) AS x(pid, side)
    LEFT JOIN tournament_participants part
      ON part.tournament_id = p_tournament_id AND part.participant_id = x.pid
    WHERE m.tournament_id = p_tournament_id AND m.round = p_round AND m.state = 'playing' AND x.pid IS NOT NULL
    ON CONFLICT (match_id, participant_id) DO NOTHING;
  END IF;

  UPDATE tournaments SET status = 'running', current_round = p_round WHERE id = p_tournament_id;
  RETURN jsonb_build_object('ok', TRUE, 'tournament', tt_tournament_json(p_tournament_id));
END;
$$;

-- Persist a live progress ping (durable so the organizer dashboard survives refresh).
CREATE OR REPLACE FUNCTION tt_update_match_progress(p_match_id TEXT, p_participant_id TEXT, p_current INT)
RETURNS VOID
LANGUAGE sql AS $$
  UPDATE tournament_match_states SET current_question = p_current
    WHERE match_id = p_match_id AND participant_id = p_participant_id AND finished = FALSE;
$$;

-- Compute and persist a match winner once both participants are finished. Winner
-- is higher score, ties broken by faster finish. Safe to call repeatedly.
CREATE OR REPLACE FUNCTION tt_resolve_match(p_match_id TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_m         tournament_matches;
  v_remaining INT;
  v_p1_score  INT;
  v_p2_score  INT;
  v_p1_finish BIGINT;
  v_p2_finish BIGINT;
  v_winner    TEXT;
BEGIN
  SELECT * INTO v_m FROM tournament_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR v_m.state = 'finished' THEN RETURN; END IF;

  SELECT count(*) INTO v_remaining FROM tournament_match_states
    WHERE match_id = p_match_id AND finished = FALSE;
  IF v_remaining > 0 THEN RETURN; END IF;

  -- Aggregate per side: one row each for individual, every member for teams.
  -- Team score is the sum of members; team finish is when its last member ended.
  SELECT COALESCE(SUM(score) FILTER (WHERE side = 'p1'), 0),
         COALESCE(SUM(score) FILTER (WHERE side = 'p2'), 0),
         COALESCE(MAX(finish_ms) FILTER (WHERE side = 'p1'), 9223372036854775807),
         COALESCE(MAX(finish_ms) FILTER (WHERE side = 'p2'), 9223372036854775807)
    INTO v_p1_score, v_p2_score, v_p1_finish, v_p2_finish
    FROM tournament_match_states WHERE match_id = p_match_id;

  IF v_p1_score > v_p2_score THEN
    v_winner := v_m.p1_id;
  ELSIF v_p2_score > v_p1_score THEN
    v_winner := v_m.p2_id;
  ELSIF v_p1_finish <= v_p2_finish THEN
    v_winner := v_m.p1_id;
  ELSE
    v_winner := v_m.p2_id;
  END IF;

  UPDATE tournament_matches SET
    state = 'finished', winner_id = v_winner,
    p1_score = v_p1_score, p2_score = v_p2_score,
    p1_finish_ms = NULLIF(v_p1_finish, 9223372036854775807),
    p2_finish_ms = NULLIF(v_p2_finish, 9223372036854775807)
  WHERE id = p_match_id;
END;
$$;

-- Record a participant's submission and resolve the match if both are done.
CREATE OR REPLACE FUNCTION tt_submit_match(p_match_id TEXT, p_participant_id TEXT, p_answers JSONB, p_score INT)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_m      tournament_matches;
  v_finish BIGINT;
BEGIN
  SELECT * INTO v_m FROM tournament_matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Match not found'); END IF;

  v_finish := tt_now_ms() - COALESCE(v_m.started_at, tt_now_ms());
  UPDATE tournament_match_states
    SET answers = p_answers, score = p_score, finished = TRUE, finish_ms = v_finish
    WHERE match_id = p_match_id AND participant_id = p_participant_id AND finished = FALSE;

  PERFORM tt_resolve_match(p_match_id);

  SELECT * INTO v_m FROM tournament_matches WHERE id = p_match_id;
  RETURN jsonb_build_object(
    'ok', TRUE,
    'matchFinished', v_m.state = 'finished',
    'winnerId', v_m.winner_id,
    'tournamentId', v_m.tournament_id,
    'round', v_m.round
  );
END;
$$;

-- Advance the current round: eliminate losers, then either crown the champion
-- (no next-round matches supplied) or persist the next round's matches (built in
-- shared/bracket.ts).
CREATE OR REPLACE FUNCTION tt_advance_round(p_tournament_id TEXT, p_organizer_id TEXT, p_next_matches JSONB)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_t           tournaments;
  v_round       INT;
  v_unfinished  INT;
  v_champion    TEXT;
  v_m           JSONB;
  v_id          TEXT;
  v_p1          TEXT;
  v_p2          TEXT;
BEGIN
  SELECT * INTO v_t FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Tournament not found'); END IF;
  IF v_t.organizer_id <> p_organizer_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only the organizer can advance the bracket');
  END IF;
  v_round := v_t.current_round;

  SELECT count(*) INTO v_unfinished FROM tournament_matches
    WHERE tournament_id = p_tournament_id AND round = v_round AND state <> 'finished';
  IF v_unfinished > 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'The current round is not finished yet');
  END IF;

  -- Eliminate the losers of the round just completed.
  IF v_t.format = 'teams' THEN
    UPDATE tournament_teams t SET eliminated_round = v_round
    FROM tournament_matches m
    WHERE m.tournament_id = p_tournament_id AND m.round = v_round
      AND t.tournament_id = p_tournament_id
      AND t.team_id IN (m.p1_id, m.p2_id)
      AND t.team_id IS DISTINCT FROM m.winner_id
      AND t.eliminated_round IS NULL;

    UPDATE tournament_participants p SET eliminated_round = v_round
    FROM tournament_teams t
    WHERE t.tournament_id = p_tournament_id AND t.eliminated_round = v_round
      AND p.tournament_id = p_tournament_id AND p.team_id = t.team_id
      AND p.eliminated_round IS NULL;
  ELSE
    UPDATE tournament_participants p SET eliminated_round = v_round
    FROM tournament_matches m
    WHERE m.tournament_id = p_tournament_id AND m.round = v_round
      AND p.tournament_id = p_tournament_id
      AND p.participant_id IN (m.p1_id, m.p2_id)
      AND p.participant_id IS DISTINCT FROM m.winner_id
      AND p.eliminated_round IS NULL;
  END IF;

  -- The API supplies the next round's matches (built in shared/bracket.ts). An
  -- EMPTY set means the final just finished — crown the lone remaining winner.
  -- (Don't infer "done" from a single winner: the play-in round can have one
  -- winner while the top seeds still wait in the main bracket.)
  IF jsonb_array_length(COALESCE(p_next_matches, '[]'::jsonb)) = 0 THEN
    SELECT winner_id INTO v_champion FROM tournament_matches
      WHERE tournament_id = p_tournament_id AND round = v_round AND winner_id IS NOT NULL LIMIT 1;
    UPDATE tournaments SET status = 'finished', champion_id = v_champion WHERE id = p_tournament_id;
    RETURN jsonb_build_object('ok', TRUE, 'finished', TRUE, 'championId', v_champion,
      'tournament', tt_tournament_json(p_tournament_id));
  END IF;

  FOR v_m IN SELECT * FROM jsonb_array_elements(p_next_matches) LOOP
    v_id := 'ttm_' || replace(gen_random_uuid()::text, '-', '');
    v_p1 := NULLIF(v_m->>'p1Id', '');
    v_p2 := NULLIF(v_m->>'p2Id', '');
    INSERT INTO tournament_matches (id, tournament_id, round, slot, p1_id, p2_id, state, winner_id)
    VALUES (
      v_id, p_tournament_id, (v_m->>'round')::int, (v_m->>'slot')::int, v_p1, v_p2,
      -- See tt_seed_bracket: only a two-seat match is playable; byes / dead slots
      -- are auto-'finished' so a partial next round can still complete.
      CASE WHEN v_p1 IS NOT NULL AND v_p2 IS NOT NULL THEN 'pending' ELSE 'finished' END,
      CASE WHEN v_p1 IS NOT NULL AND v_p2 IS NULL THEN v_p1
           WHEN v_p2 IS NOT NULL AND v_p1 IS NULL THEN v_p2
           ELSE NULL END
    );
  END LOOP;

  UPDATE tournaments SET current_round = v_round + 1 WHERE id = p_tournament_id;
  RETURN jsonb_build_object('ok', TRUE, 'finished', FALSE, 'tournament', tt_tournament_json(p_tournament_id));
END;
$$;

-- ---------- cleanup ----------

CREATE OR REPLACE FUNCTION tt_cleanup_expired() RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM tournaments WHERE expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================
-- GRANTS: server-only. Revoke from browser-facing roles, allow service role.
-- ============================================
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT (p.oid::regprocedure)::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'tt\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, public', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;
