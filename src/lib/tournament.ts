import type {
  Tournament,
  TournamentSettings,
  TournamentLiveState,
  TournamentApiResponse,
  TournamentAction,
} from '@shared/types';

// Tournament API — all calls go to the single /api/tournament endpoint with an
// `action` field, mirroring the multiplayer client.
async function tournamentApi<TAction extends TournamentAction>(
  action: TAction,
  data: Record<string, unknown> = {}
): Promise<TournamentApiResponse<TAction>> {
  const response = await fetch('/api/tournament', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data }),
  });
  return response.json() as Promise<TournamentApiResponse<TAction>>;
}

export function createTournament(
  organizerId: string,
  name: string,
  format: 'individual' | 'teams',
  settings: TournamentSettings
): Promise<TournamentApiResponse<'create-tournament'>> {
  return tournamentApi('create-tournament', { organizerId, name, format, settings });
}

export function joinTournament(
  code: string,
  participantId: string,
  name: string
): Promise<TournamentApiResponse<'join-tournament'>> {
  return tournamentApi('join-tournament', { code, participantId, name });
}

export function leaveTournament(tournamentId: string, participantId: string): Promise<TournamentApiResponse<'leave-tournament'>> {
  return tournamentApi('leave-tournament', { tournamentId, participantId });
}

export function kickParticipant(
  tournamentId: string,
  organizerId: string,
  targetId: string
): Promise<TournamentApiResponse<'kick-participant'>> {
  return tournamentApi('kick-participant', { tournamentId, organizerId, targetId });
}

export function seedBracket(
  tournamentId: string,
  organizerId: string,
  mode: 'auto' | 'manual',
  participantOrder?: string[]
): Promise<TournamentApiResponse<'seed-bracket'>> {
  return tournamentApi('seed-bracket', { tournamentId, organizerId, mode, participantOrder });
}

export function formTeams(
  tournamentId: string,
  organizerId: string,
  teams: Array<{ teamId: string; name: string; memberIds: string[] }>
): Promise<TournamentApiResponse<'form-teams'>> {
  return tournamentApi('form-teams', { tournamentId, organizerId, teams });
}

export function setRoundSettings(
  tournamentId: string,
  organizerId: string,
  round: number,
  settings: TournamentSettings
): Promise<TournamentApiResponse<'set-round-settings'>> {
  return tournamentApi('set-round-settings', { tournamentId, organizerId, round, settings });
}

export function startRound(
  tournamentId: string,
  organizerId: string,
  round: number
): Promise<TournamentApiResponse<'start-round'>> {
  return tournamentApi('start-round', { tournamentId, organizerId, round });
}

export function updateMatchProgress(
  tournamentId: string,
  matchId: string,
  participantId: string,
  currentQuestion: number
): Promise<TournamentApiResponse<'update-match-progress'>> {
  return tournamentApi('update-match-progress', { tournamentId, matchId, participantId, currentQuestion });
}

export function submitMatch(
  tournamentId: string,
  matchId: string,
  participantId: string,
  answers: string[],
  score: number
): Promise<TournamentApiResponse<'submit-match'>> {
  return tournamentApi('submit-match', { tournamentId, matchId, participantId, answers, score });
}

export function advanceRound(tournamentId: string, organizerId: string): Promise<TournamentApiResponse<'advance-round'>> {
  return tournamentApi('advance-round', { tournamentId, organizerId });
}

/** GET snapshot for late-join / refresh: the tournament plus current-round live states. */
export async function fetchTournament(
  tournamentId: string
): Promise<{ tournament: Tournament; liveStates: TournamentLiveState[] } | null> {
  const response = await fetch(`/api/tournament?tournamentId=${encodeURIComponent(tournamentId)}`);
  if (!response.ok) return null;
  const data = (await response.json()) as {
    success: boolean;
    tournament?: Tournament;
    liveStates?: TournamentLiveState[];
  };
  if (!data.success || !data.tournament) return null;
  return { tournament: data.tournament, liveStates: data.liveStates ?? [] };
}
