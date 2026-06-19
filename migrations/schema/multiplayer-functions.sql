-- ============================================
-- SUPABASE FUNCTIONS: MULTIPLAYER (atomic state transitions)
-- Run AFTER multiplayer-tables.sql.
--
-- Every concurrent mutation goes through one of these plpgsql functions so the
-- read-modify-write is atomic (row lock via SELECT ... FOR UPDATE). This is what
-- makes 20-30 player tournament rooms correct: exactly one submit observes
-- "all finished", quick-match never double-pairs, joins never exceed capacity.
--
-- All functions are SECURITY INVOKER (default) and are called only with the
-- service-role key (which bypasses RLS). EXECUTE is revoked from anon/
-- authenticated at the bottom of this file.
-- ============================================

-- ---------- helpers ----------

-- Current time in epoch milliseconds (mirrors JS Date.now()).
CREATE OR REPLACE FUNCTION mp_now_ms() RETURNS BIGINT
LANGUAGE sql STABLE AS $$
  SELECT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT;
$$;

-- Generate an 8-char room code (excludes confusing 0/O/1/I), matching the old
-- generateRoomCode() alphabet.
CREATE OR REPLACE FUNCTION mp_gen_code() RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  chars  TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i      INT;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars))::int + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Push a room's expiry out one hour from now (called on every mutation so an
-- active game can't expire mid-play).
CREATE OR REPLACE FUNCTION mp_touch(p_room_id TEXT) RETURNS VOID
LANGUAGE sql AS $$
  UPDATE multiplayer_rooms SET expires_at = now() + INTERVAL '1 hour' WHERE id = p_room_id;
$$;

-- Rebuild the rooms.teams JSONB (playerIds) from the players table, keeping the
-- fixed Team A / Team B names.
CREATE OR REPLACE FUNCTION mp_rebuild_teams(p_room_id TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE multiplayer_rooms SET teams = jsonb_build_array(
    jsonb_build_object('id', 'team-a', 'name', 'Team A', 'playerIds', COALESCE((
      SELECT jsonb_agg(player_id ORDER BY joined_at)
      FROM multiplayer_players WHERE room_id = p_room_id AND team_id = 'team-a'), '[]'::jsonb)),
    jsonb_build_object('id', 'team-b', 'name', 'Team B', 'playerIds', COALESCE((
      SELECT jsonb_agg(player_id ORDER BY joined_at)
      FROM multiplayer_players WHERE room_id = p_room_id AND team_id = 'team-b'), '[]'::jsonb))
  ) WHERE id = p_room_id;
END;
$$;

-- Randomly split a room's players into team-a / team-b and write both the
-- players.team_id and rooms.teams JSONB.
CREATE OR REPLACE FUNCTION mp_assign_random_teams(p_room_id TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_ids  TEXT[];
  v_half INT;
  v_a    TEXT[];
  v_b    TEXT[];
BEGIN
  SELECT array_agg(player_id ORDER BY random()) INTO v_ids
  FROM multiplayer_players WHERE room_id = p_room_id;
  IF v_ids IS NULL THEN RETURN; END IF;

  v_half := ceil(array_length(v_ids, 1)::numeric / 2);
  v_a := v_ids[1:v_half];
  v_b := v_ids[v_half + 1 : array_length(v_ids, 1)];

  UPDATE multiplayer_players SET team_id = 'team-a'
    WHERE room_id = p_room_id AND player_id = ANY(v_a);
  UPDATE multiplayer_players SET team_id = 'team-b'
    WHERE room_id = p_room_id AND player_id = ANY(COALESCE(v_b, ARRAY[]::text[]));

  PERFORM mp_rebuild_teams(p_room_id);
END;
$$;

-- Assemble the full Room object in the EXACT shape shared/types.ts expects
-- (camelCase keys). Single source for every read. Returns NULL if not found.
CREATE OR REPLACE FUNCTION mp_room_json(p_room_id TEXT) RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'code', r.code,
    'hostId', r.host_id,
    'settings', r.settings,
    'questions', r.questions,
    'teams', r.teams,
    'gameState', r.game_state,
    'gameStartTime', r.game_start_time,
    'createdAt', (EXTRACT(EPOCH FROM r.created_at) * 1000)::BIGINT,
    'isQuickMatch', r.is_quick_match,
    'rematchState', r.rematch_state,
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', p.player_id,
        'name', p.name,
        'isHost', p.is_host,
        'isReady', p.is_ready,
        'connected', p.connected,
        'teamId', p.team_id
      )) ORDER BY p.joined_at)
      FROM multiplayer_players p WHERE p.room_id = r.id
    ), '[]'::jsonb),
    'playerStates', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'playerId', s.player_id,
        'playerName', s.name,
        'answers', s.answers,
        'currentQuestion', s.current_question,
        'finished', s.finished,
        'finishTime', s.finish_time,
        'score', s.score
      ) ORDER BY s.player_id)
      FROM multiplayer_player_states s WHERE s.room_id = r.id
    ), '[]'::jsonb)
  )
  FROM multiplayer_rooms r WHERE r.id = p_room_id;
$$;

-- ---------- room lifecycle ----------

-- Create a private room with the host as the only player.
CREATE OR REPLACE FUNCTION mp_create_room(
  p_host_id TEXT, p_name TEXT, p_is_quick BOOLEAN, p_settings JSONB
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_id       TEXT := 'room_' || replace(gen_random_uuid()::text, '-', '');
  v_code     TEXT;
  v_attempts INT := 0;
BEGIN
  LOOP
    v_code := mp_gen_code();
    BEGIN
      INSERT INTO multiplayer_rooms (id, code, host_id, game_state, settings, is_quick_match)
      VALUES (v_id, v_code, p_host_id, 'waiting', p_settings, COALESCE(p_is_quick, FALSE));
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempts := v_attempts + 1;
      IF v_attempts > 10 THEN RAISE; END IF;
    END;
  END LOOP;

  INSERT INTO multiplayer_players (room_id, player_id, name, is_host, is_ready, connected)
  VALUES (v_id, p_host_id, p_name, TRUE, FALSE, TRUE);

  RETURN jsonb_build_object('room', mp_room_json(v_id));
END;
$$;

-- Join a waiting room by code. Atomic capacity check; team assignment in team mode.
CREATE OR REPLACE FUNCTION mp_join_room(p_code TEXT, p_player_id TEXT, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_room   multiplayer_rooms;
  v_max    INT;
  v_count  INT;
  v_mode   TEXT;
  v_team_a INT;
  v_team_b INT;
  v_target TEXT;
BEGIN
  SELECT * INTO v_room FROM multiplayer_rooms WHERE code = upper(p_code) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Room not found');
  END IF;
  IF v_room.game_state <> 'waiting' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Game already in progress');
  END IF;

  -- Rejoin if already present.
  IF EXISTS (SELECT 1 FROM multiplayer_players WHERE room_id = v_room.id AND player_id = p_player_id) THEN
    UPDATE multiplayer_players SET connected = TRUE
      WHERE room_id = v_room.id AND player_id = p_player_id;
    RETURN jsonb_build_object('ok', TRUE, 'room', mp_room_json(v_room.id));
  END IF;

  v_max := COALESCE((v_room.settings->>'maxPlayers')::int, 2);
  SELECT count(*) INTO v_count FROM multiplayer_players WHERE room_id = v_room.id;
  IF v_count >= v_max THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Room is full');
  END IF;

  INSERT INTO multiplayer_players (room_id, player_id, name, is_host, is_ready, connected)
  VALUES (v_room.id, p_player_id, p_name, FALSE, FALSE, TRUE);

  v_mode := v_room.settings->>'gameMode';
  IF v_mode = 'teams' THEN
    IF jsonb_array_length(v_room.teams) = 0 THEN
      IF (SELECT count(*) FROM multiplayer_players WHERE room_id = v_room.id) >= 2 THEN
        PERFORM mp_assign_random_teams(v_room.id);
      END IF;
    ELSE
      v_team_a := jsonb_array_length(v_room.teams->0->'playerIds');
      v_team_b := jsonb_array_length(v_room.teams->1->'playerIds');
      v_target := CASE WHEN v_team_a <= v_team_b THEN 'team-a' ELSE 'team-b' END;
      UPDATE multiplayer_players SET team_id = v_target
        WHERE room_id = v_room.id AND player_id = p_player_id;
      PERFORM mp_rebuild_teams(v_room.id);
    END IF;
  END IF;

  PERFORM mp_touch(v_room.id);
  RETURN jsonb_build_object('ok', TRUE, 'room', mp_room_json(v_room.id));
END;
$$;

-- Remove a player; delete the room if it becomes empty.
CREATE OR REPLACE FUNCTION mp_leave_room(p_room_id TEXT, p_player_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_name  TEXT;
  v_count INT;
BEGIN
  PERFORM 1 FROM multiplayer_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Room not found');
  END IF;

  SELECT name INTO v_name FROM multiplayer_players WHERE room_id = p_room_id AND player_id = p_player_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Player not in room');
  END IF;

  DELETE FROM multiplayer_players WHERE room_id = p_room_id AND player_id = p_player_id;
  DELETE FROM multiplayer_player_states WHERE room_id = p_room_id AND player_id = p_player_id;

  SELECT count(*) INTO v_count FROM multiplayer_players WHERE room_id = p_room_id;
  IF v_count = 0 THEN
    DELETE FROM multiplayer_rooms WHERE id = p_room_id;
    RETURN jsonb_build_object('ok', TRUE, 'playerName', v_name, 'room', NULL, 'deleted', TRUE);
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'playerName', v_name, 'room', mp_room_json(p_room_id), 'deleted', FALSE);
END;
$$;

-- Host updates settings (waiting only). Switching to teams assigns; ffa clears.
CREATE OR REPLACE FUNCTION mp_update_settings(p_room_id TEXT, p_player_id TEXT, p_settings JSONB)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_room   multiplayer_rooms;
  v_merged JSONB;
  v_mode   TEXT;
  v_count  INT;
BEGIN
  SELECT * INTO v_room FROM multiplayer_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Room not found');
  END IF;
  IF v_room.host_id <> p_player_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only the host can update settings');
  END IF;
  IF v_room.game_state <> 'waiting' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Cannot update settings while game is in progress');
  END IF;

  v_merged := v_room.settings || p_settings;
  UPDATE multiplayer_rooms SET settings = v_merged WHERE id = p_room_id;

  v_mode := v_merged->>'gameMode';
  SELECT count(*) INTO v_count FROM multiplayer_players WHERE room_id = p_room_id;
  IF v_mode = 'teams' AND v_count >= 2 THEN
    PERFORM mp_assign_random_teams(p_room_id);
  ELSIF v_mode = 'ffa' THEN
    UPDATE multiplayer_players SET team_id = NULL WHERE room_id = p_room_id;
    UPDATE multiplayer_rooms SET teams = '[]'::jsonb WHERE id = p_room_id;
  END IF;

  PERFORM mp_touch(p_room_id);
  RETURN jsonb_build_object('ok', TRUE, 'room', mp_room_json(p_room_id));
END;
$$;

-- Host moves a player to a specific team.
CREATE OR REPLACE FUNCTION mp_assign_team(p_room_id TEXT, p_player_id TEXT, p_target TEXT, p_team TEXT)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_room multiplayer_rooms;
BEGIN
  SELECT * INTO v_room FROM multiplayer_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Room not found');
  END IF;
  IF v_room.host_id <> p_player_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only the host can assign teams');
  END IF;
  IF v_room.settings->>'gameMode' <> 'teams' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Room is not in team mode');
  END IF;

  UPDATE multiplayer_players SET team_id = p_team
    WHERE room_id = p_room_id AND player_id = p_target;
  PERFORM mp_rebuild_teams(p_room_id);
  PERFORM mp_touch(p_room_id);
  RETURN jsonb_build_object('ok', TRUE, 'room', mp_room_json(p_room_id));
END;
$$;

-- ---------- ready / start ----------

-- Host opens the ready phase: optionally update settings, reset everyone to not-ready.
CREATE OR REPLACE FUNCTION mp_start_ready_phase(p_room_id TEXT, p_player_id TEXT, p_settings JSONB)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  PERFORM 1 FROM multiplayer_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Room not found');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM multiplayer_players
                 WHERE room_id = p_room_id AND player_id = p_player_id AND is_host) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only host can start ready phase');
  END IF;
  SELECT count(*) INTO v_count FROM multiplayer_players WHERE room_id = p_room_id;
  IF v_count < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Need at least 2 players to start');
  END IF;

  IF p_settings IS NOT NULL AND p_settings <> 'null'::jsonb THEN
    UPDATE multiplayer_rooms SET settings = settings || p_settings WHERE id = p_room_id;
  END IF;
  UPDATE multiplayer_players SET is_ready = FALSE WHERE room_id = p_room_id;

  PERFORM mp_touch(p_room_id);
  RETURN jsonb_build_object('ok', TRUE, 'room', mp_room_json(p_room_id));
END;
$$;

-- Toggle a player's ready flag; report whether everyone (>=2) is ready.
CREATE OR REPLACE FUNCTION mp_set_ready(p_room_id TEXT, p_player_id TEXT, p_is_ready BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_total INT;
  v_ready INT;
BEGIN
  PERFORM 1 FROM multiplayer_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('room', NULL, 'allReady', FALSE);
  END IF;

  UPDATE multiplayer_players SET is_ready = p_is_ready
    WHERE room_id = p_room_id AND player_id = p_player_id;

  SELECT count(*), count(*) FILTER (WHERE is_ready) INTO v_total, v_ready
    FROM multiplayer_players WHERE room_id = p_room_id;

  PERFORM mp_touch(p_room_id);
  RETURN jsonb_build_object(
    'room', mp_room_json(p_room_id),
    'allReady', (v_total >= 2 AND v_total = v_ready)
  );
END;
$$;

-- Idempotently transition waiting -> playing, seed player_states, set start time.
-- Returns started=TRUE only for the call that actually flipped the state, so only
-- one caller emits game-starting. Questions are generated in TypeScript.
CREATE OR REPLACE FUNCTION mp_start_game(p_room_id TEXT, p_questions JSONB)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_room    multiplayer_rooms;
  v_started BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_room FROM multiplayer_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('started', FALSE, 'room', NULL);
  END IF;

  IF v_room.game_state = 'waiting' THEN
    IF v_room.settings->>'gameMode' = 'teams'
       AND jsonb_array_length(v_room.teams) = 0 THEN
      PERFORM mp_assign_random_teams(p_room_id);
    END IF;

    UPDATE multiplayer_rooms
      SET game_state = 'playing', questions = p_questions, game_start_time = mp_now_ms()
      WHERE id = p_room_id;

    INSERT INTO multiplayer_player_states (room_id, player_id, name)
    SELECT p_room_id, player_id, name FROM multiplayer_players WHERE room_id = p_room_id
    ON CONFLICT (room_id, player_id) DO NOTHING;

    v_started := TRUE;
  END IF;

  PERFORM mp_touch(p_room_id);
  RETURN jsonb_build_object('started', v_started, 'room', mp_room_json(p_room_id));
END;
$$;

-- ---------- in-game ----------

-- Record a player's submission and atomically report whether everyone is done.
-- The row lock guarantees exactly one caller sees allFinished = TRUE.
CREATE OR REPLACE FUNCTION mp_submit_answers(
  p_room_id TEXT, p_player_id TEXT, p_answers JSONB, p_score INT
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_room      multiplayer_rooms;
  v_remaining INT;
  v_all       BOOLEAN;
  v_finish    BIGINT;
BEGIN
  SELECT * INTO v_room FROM multiplayer_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('room', NULL, 'allFinished', FALSE);
  END IF;

  UPDATE multiplayer_player_states
    SET answers = p_answers, finished = TRUE, score = p_score,
        finish_time = mp_now_ms() - COALESCE(v_room.game_start_time, mp_now_ms())
    WHERE room_id = p_room_id AND player_id = p_player_id AND finished = FALSE;

  SELECT count(*) FILTER (WHERE NOT finished) INTO v_remaining
    FROM multiplayer_player_states WHERE room_id = p_room_id;
  v_all := (v_remaining = 0);

  IF v_all THEN
    UPDATE multiplayer_rooms SET game_state = 'finished' WHERE id = p_room_id;
  END IF;

  SELECT finish_time INTO v_finish
    FROM multiplayer_player_states WHERE room_id = p_room_id AND player_id = p_player_id;

  PERFORM mp_touch(p_room_id);
  RETURN jsonb_build_object('room', mp_room_json(p_room_id), 'allFinished', v_all, 'finishTime', v_finish);
END;
$$;

-- Mark a player disconnected; if mid-game, they forfeit (score 0). Reports
-- whether that ended the game.
CREATE OR REPLACE FUNCTION mp_mark_disconnected(p_room_id TEXT, p_player_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_room      multiplayer_rooms;
  v_remaining INT;
  v_ended     BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_room FROM multiplayer_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('room', NULL, 'ended', FALSE);
  END IF;

  UPDATE multiplayer_players SET connected = FALSE
    WHERE room_id = p_room_id AND player_id = p_player_id;

  IF v_room.game_state IN ('playing', 'countdown') THEN
    UPDATE multiplayer_player_states
      SET finished = TRUE, score = 0,
          finish_time = mp_now_ms() - COALESCE(v_room.game_start_time, mp_now_ms())
      WHERE room_id = p_room_id AND player_id = p_player_id AND finished = FALSE;

    SELECT count(*) FILTER (WHERE NOT finished) INTO v_remaining
      FROM multiplayer_player_states WHERE room_id = p_room_id;
    IF v_remaining = 0 THEN
      UPDATE multiplayer_rooms SET game_state = 'finished' WHERE id = p_room_id;
      v_ended := TRUE;
    END IF;
  END IF;

  RETURN jsonb_build_object('room', mp_room_json(p_room_id), 'ended', v_ended);
END;
$$;

-- ---------- rematch ----------

-- request | accept | decline. On the final accept (all connected players in),
-- clone a new waiting room (idempotently, guarded by rematch_state.newRoomId).
CREATE OR REPLACE FUNCTION mp_rematch(
  p_room_id TEXT, p_player_id TEXT, p_name TEXT, p_keep_teams BOOLEAN, p_action TEXT
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_room      multiplayer_rooms;
  v_state     JSONB;
  v_accepted  JSONB;
  v_total     INT;
  v_count     INT;
  v_new_id    TEXT;
  v_new_code  TEXT;
  v_attempts  INT := 0;
BEGIN
  SELECT * INTO v_room FROM multiplayer_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Room not found');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM multiplayer_players WHERE room_id = p_room_id AND player_id = p_player_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Player not in room');
  END IF;

  SELECT count(*) INTO v_total FROM multiplayer_players WHERE room_id = p_room_id AND connected;

  IF p_action = 'request' THEN
    UPDATE multiplayer_rooms SET rematch_state = jsonb_build_object(
      'requesterId', p_player_id, 'requesterName', p_name,
      'keepTeams', COALESCE(p_keep_teams, FALSE),
      'acceptedPlayerIds', jsonb_build_array(p_player_id)
    ) WHERE id = p_room_id;
    RETURN jsonb_build_object('ok', TRUE, 'action', 'request', 'totalNeeded', v_total);
  END IF;

  IF p_action = 'decline' THEN
    UPDATE multiplayer_rooms SET rematch_state = NULL WHERE id = p_room_id;
    RETURN jsonb_build_object('ok', TRUE, 'action', 'decline', 'declinedBy', p_name);
  END IF;

  IF p_action = 'accept' THEN
    v_state := v_room.rematch_state;
    IF v_state IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'No pending rematch request');
    END IF;

    -- Already created -> return the existing new room (idempotent).
    IF v_state ? 'newRoomId' THEN
      RETURN jsonb_build_object('ok', TRUE, 'action', 'accept', 'allAccepted', TRUE,
        'newRoom', mp_room_json(v_state->>'newRoomId'),
        'acceptedCount', jsonb_array_length(v_state->'acceptedPlayerIds'), 'totalNeeded', v_total);
    END IF;

    v_accepted := v_state->'acceptedPlayerIds';
    IF NOT (v_accepted @> to_jsonb(p_player_id)) THEN
      v_accepted := v_accepted || to_jsonb(p_player_id);
    END IF;
    v_count := jsonb_array_length(v_accepted);

    IF v_count < v_total THEN
      UPDATE multiplayer_rooms
        SET rematch_state = jsonb_set(v_state, '{acceptedPlayerIds}', v_accepted)
        WHERE id = p_room_id;
      RETURN jsonb_build_object('ok', TRUE, 'action', 'accept', 'allAccepted', FALSE,
        'acceptedCount', v_count, 'totalNeeded', v_total,
        'playerId', p_player_id, 'playerName', p_name);
    END IF;

    -- Everyone accepted -> clone a new waiting room.
    v_new_id := 'room_' || replace(gen_random_uuid()::text, '-', '');
    LOOP
      v_new_code := mp_gen_code();
      BEGIN
        INSERT INTO multiplayer_rooms (id, code, host_id, game_state, settings, is_quick_match)
        VALUES (v_new_id, v_new_code,
          (SELECT player_id FROM multiplayer_players WHERE room_id = p_room_id AND is_host LIMIT 1),
          'waiting', v_room.settings, v_room.is_quick_match);
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        v_attempts := v_attempts + 1;
        IF v_attempts > 10 THEN RAISE; END IF;
      END;
    END LOOP;

    INSERT INTO multiplayer_players (room_id, player_id, name, is_host, is_ready, connected, team_id)
    SELECT v_new_id, player_id, name, is_host, FALSE, TRUE,
           CASE WHEN (v_state->>'keepTeams')::boolean THEN team_id ELSE NULL END
    FROM multiplayer_players WHERE room_id = p_room_id AND connected;

    IF v_room.settings->>'gameMode' = 'teams' THEN
      IF (v_state->>'keepTeams')::boolean THEN
        PERFORM mp_rebuild_teams(v_new_id);
      ELSE
        PERFORM mp_assign_random_teams(v_new_id);
      END IF;
    END IF;

    UPDATE multiplayer_rooms
      SET rematch_state = jsonb_set(jsonb_set(v_state, '{acceptedPlayerIds}', v_accepted),
                                    '{newRoomId}', to_jsonb(v_new_id))
      WHERE id = p_room_id;

    RETURN jsonb_build_object('ok', TRUE, 'action', 'accept', 'allAccepted', TRUE,
      'newRoom', mp_room_json(v_new_id), 'acceptedCount', v_count, 'totalNeeded', v_total);
  END IF;

  RETURN jsonb_build_object('ok', FALSE, 'error', 'Invalid rematchAction');
END;
$$;

-- ---------- quick match ----------

-- Atomically pair with a waiting opponent for the same operation, or enqueue.
CREATE OR REPLACE FUNCTION mp_claim_quick_match(p_player_id TEXT, p_name TEXT, p_operation TEXT)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_opp multiplayer_queue;
BEGIN
  SELECT * INTO v_opp FROM multiplayer_queue
    WHERE operation = p_operation AND player_id <> p_player_id
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    DELETE FROM multiplayer_queue WHERE player_id = v_opp.player_id;
    RETURN jsonb_build_object('matched', TRUE,
      'opponent', jsonb_build_object('playerId', v_opp.player_id, 'playerName', v_opp.name));
  END IF;

  INSERT INTO multiplayer_queue (player_id, name, operation, created_at)
    VALUES (p_player_id, p_name, p_operation, now())
    ON CONFLICT (player_id) DO UPDATE
      SET name = excluded.name, operation = excluded.operation, created_at = now();

  RETURN jsonb_build_object('matched', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION mp_dequeue(p_player_id TEXT) RETURNS VOID
LANGUAGE sql AS $$
  DELETE FROM multiplayer_queue WHERE player_id = p_player_id;
$$;

-- ---------- cleanup ----------

-- Delete expired rooms (cascades to players/states), stale queue entries, expired
-- rate-limit buckets, and long-closed polls. Schedule via pg_cron, or call
-- opportunistically. Returns the number of rooms removed.
CREATE OR REPLACE FUNCTION mp_cleanup_expired() RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM multiplayer_rooms WHERE expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  DELETE FROM multiplayer_queue WHERE created_at < now() - INTERVAL '5 minutes';
  DELETE FROM rate_limits WHERE expires_at < now();
  DELETE FROM poll_state WHERE closed AND closed_at < now() - INTERVAL '30 seconds';
  RETURN v_count;
END;
$$;

-- ---------- rate limiting ----------

-- Fixed-window counter. Returns TRUE if the hit is allowed (count <= max within
-- the current window).
CREATE OR REPLACE FUNCTION rate_limit_hit(p_key TEXT, p_max INT, p_window_secs INT)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
  v_window BIGINT := floor(EXTRACT(EPOCH FROM now()) / p_window_secs)::bigint;
  v_bucket TEXT := p_key || ':' || v_window::text;
  v_count  INT;
BEGIN
  INSERT INTO rate_limits (bucket, count, expires_at)
    VALUES (v_bucket, 1, now() + make_interval(secs => p_window_secs * 2))
    ON CONFLICT (bucket) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count INTO v_count;
  RETURN v_count <= p_max;
END;
$$;

-- ---------- polls (late-join snapshot) ----------

CREATE OR REPLACE FUNCTION poll_start(p_poll JSONB) RETURNS JSONB
LANGUAGE plpgsql AS $$
BEGIN
  -- WHERE TRUE clears every row but still satisfies the `safeupdate` extension,
  -- which rejects unqualified deletes ("DELETE requires a WHERE clause").
  DELETE FROM poll_state WHERE TRUE;
  INSERT INTO poll_state (id, poll, tallies, closed, started_at)
    VALUES (
      p_poll->>'id',
      p_poll,
      COALESCE(
        (SELECT jsonb_object_agg(o->>'id', 0) FROM jsonb_array_elements(p_poll->'options') o),
        '{}'::jsonb
      ),
      FALSE,
      now()
    );
  RETURN p_poll;
END;
$$;

CREATE OR REPLACE FUNCTION poll_vote(p_poll_id TEXT, p_option_id TEXT) RETURNS VOID
LANGUAGE sql AS $$
  UPDATE poll_state
    SET tallies = jsonb_set(tallies, ARRAY[p_option_id],
                            to_jsonb(COALESCE((tallies->>p_option_id)::int, 0) + 1))
    WHERE id = p_poll_id AND NOT closed;
$$;

CREATE OR REPLACE FUNCTION poll_close(p_poll_id TEXT) RETURNS VOID
LANGUAGE sql AS $$
  UPDATE poll_state SET closed = TRUE, closed_at = now() WHERE id = p_poll_id;
$$;

CREATE OR REPLACE FUNCTION poll_get() RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'poll', poll,
    'tallies', tallies,
    'closed', closed,
    'closedAt', CASE WHEN closed_at IS NULL THEN NULL ELSE (EXTRACT(EPOCH FROM closed_at) * 1000)::BIGINT END
  )
  FROM poll_state
  ORDER BY started_at DESC
  LIMIT 1;
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
    WHERE n.nspname = 'public'
      AND (p.proname LIKE 'mp\_%' ESCAPE '\'
           OR p.proname IN ('rate_limit_hit', 'poll_start', 'poll_vote', 'poll_close', 'poll_get'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, public', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;
