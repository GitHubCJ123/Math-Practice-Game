import type { Tournament, TournamentSettings, TournamentLiveState, Question } from "../../shared/types.js";
import type { BracketMatch } from "../../shared/bracket.js";
import { getSupabase } from "./db-pool.js";

/**
 * Tournament store backed by Supabase Postgres. Thin async wrappers over the
 * atomic `tt_*` plpgsql functions (see migrations/schema/tournament-functions.sql),
 * mirroring lib/api/room-store.ts. The functions return the full Tournament
 * object already shaped to match shared/types.ts.
 */

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) {
    console.error(`[lib/api/tournament-store] rpc ${fn} failed:`, error);
    throw new Error(error.message);
  }
  return data as T;
}

export interface TournamentEnvelope {
  ok: boolean;
  error?: string;
  tournamentId?: string;
  tournament: Tournament | null;
}
export interface SubmitMatchResult {
  ok: boolean;
  error?: string;
  matchFinished: boolean;
  winnerId: string | null;
  tournamentId?: string;
  round?: number;
}
export interface AdvanceResult {
  ok: boolean;
  error?: string;
  finished: boolean;
  championId?: string | null;
  tournament: Tournament | null;
}

export async function getTournament(tournamentId: string): Promise<Tournament | null> {
  return callRpc<Tournament | null>("tt_tournament_json", { p_id: tournamentId });
}

export async function getLiveStates(tournamentId: string, round: number): Promise<TournamentLiveState[]> {
  return callRpc<TournamentLiveState[]>("tt_live_states", { p_id: tournamentId, p_round: round });
}

export async function createTournament(
  organizerId: string,
  name: string,
  format: "individual" | "teams",
  settings: TournamentSettings
): Promise<{ tournament: Tournament }> {
  return callRpc<{ tournament: Tournament }>("tt_create_tournament", {
    p_organizer_id: organizerId,
    p_name: name,
    p_format: format,
    p_settings: settings,
  });
}

export async function joinTournament(
  code: string,
  participantId: string,
  name: string
): Promise<TournamentEnvelope> {
  return callRpc<TournamentEnvelope>("tt_join_tournament", {
    p_code: code.toUpperCase(),
    p_participant_id: participantId,
    p_name: name,
  });
}

export async function leaveTournament(tournamentId: string, participantId: string): Promise<TournamentEnvelope> {
  return callRpc<TournamentEnvelope>("tt_leave_tournament", {
    p_tournament_id: tournamentId,
    p_participant_id: participantId,
  });
}

export async function kickParticipant(
  tournamentId: string,
  organizerId: string,
  targetId: string
): Promise<TournamentEnvelope> {
  return callRpc<TournamentEnvelope>("tt_kick_participant", {
    p_tournament_id: tournamentId,
    p_organizer_id: organizerId,
    p_target: targetId,
  });
}

export async function seedBracket(
  tournamentId: string,
  organizerId: string,
  matches: BracketMatch[]
): Promise<TournamentEnvelope> {
  return callRpc<TournamentEnvelope>("tt_seed_bracket", {
    p_tournament_id: tournamentId,
    p_organizer_id: organizerId,
    p_matches: matches,
  });
}

export async function formTeams(
  tournamentId: string,
  organizerId: string,
  teams: Array<{ teamId: string; name: string; memberIds: string[] }>
): Promise<TournamentEnvelope> {
  return callRpc<TournamentEnvelope>("tt_form_teams", {
    p_tournament_id: tournamentId,
    p_organizer_id: organizerId,
    p_teams: teams,
  });
}

export async function setRoundSettings(
  tournamentId: string,
  organizerId: string,
  round: number,
  settings: TournamentSettings
): Promise<TournamentEnvelope> {
  return callRpc<TournamentEnvelope>("tt_set_round_settings", {
    p_tournament_id: tournamentId,
    p_organizer_id: organizerId,
    p_round: round,
    p_settings: settings,
  });
}

export async function startRound(
  tournamentId: string,
  organizerId: string,
  round: number,
  questions: Question[],
  settings: TournamentSettings
): Promise<TournamentEnvelope> {
  return callRpc<TournamentEnvelope>("tt_start_round", {
    p_tournament_id: tournamentId,
    p_organizer_id: organizerId,
    p_round: round,
    p_questions: questions,
    p_settings: settings,
  });
}

export async function updateMatchProgress(
  matchId: string,
  participantId: string,
  currentQuestion: number
): Promise<void> {
  await callRpc<null>("tt_update_match_progress", {
    p_match_id: matchId,
    p_participant_id: participantId,
    p_current: currentQuestion,
  });
}

export async function submitMatch(
  matchId: string,
  participantId: string,
  answers: string[],
  score: number
): Promise<SubmitMatchResult> {
  return callRpc<SubmitMatchResult>("tt_submit_match", {
    p_match_id: matchId,
    p_participant_id: participantId,
    p_answers: answers,
    p_score: score,
  });
}

export async function advanceRound(
  tournamentId: string,
  organizerId: string,
  nextMatches: BracketMatch[]
): Promise<AdvanceResult> {
  return callRpc<AdvanceResult>("tt_advance_round", {
    p_tournament_id: tournamentId,
    p_organizer_id: organizerId,
    p_next_matches: nextMatches,
  });
}
