import type { VercelRequest, VercelResponse } from "@vercel/node";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { TournamentActionSchema, validate } from "../lib/api/validation.js";
import type { TournamentActionInput } from "../lib/api/validation.js";
import { getPusher } from "../lib/api/pusher.js";
import {
  createTournament,
  joinTournament,
  leaveTournament,
  kickParticipant,
  seedBracket,
  formTeams,
  setRoundSettings,
  startRound,
  updateMatchProgress,
  submitMatch,
  advanceRound,
  getTournament,
  getLiveStates,
} from "../lib/api/tournament-store.js";
import { buildSeedRound, buildRoundOfBase, buildNextRound, planBracket } from "../shared/bracket.js";
import type { BracketMatch } from "../shared/bracket.js";
import { generateQuestions } from "../shared/questions.js";
import type {
  TournamentSettings,
  TournamentEventName,
  TournamentEventPayloads,
  TournamentMatchEventPayloads,
} from "../shared/types.js";

type ActionBody<TAction extends TournamentActionInput["action"]> = Extract<
  TournamentActionInput,
  { action: TAction }
>;

async function triggerPusher(channel: string, event: string, data: unknown): Promise<void> {
  try {
    await getPusher().trigger(channel, event, data);
  } catch (error) {
    console.error(`[api/tournament] Pusher trigger failed (${event} on ${channel}):`, error);
    throw error;
  }
}

/** Typed emit for bracket-wide events on the `tournament-${id}` channel. */
async function triggerTournamentEvent<E extends TournamentEventName>(
  tournamentId: string,
  event: E,
  data: TournamentEventPayloads[E]
): Promise<void> {
  await triggerPusher(`tournament-${tournamentId}`, event, data);
}

/** Typed emit for the two players of a single match on `tmatch-${matchId}`. */
async function triggerMatchEvent<E extends keyof TournamentMatchEventPayloads>(
  matchId: string,
  event: E,
  data: TournamentMatchEventPayloads[E]
): Promise<void> {
  await triggerPusher(`tmatch-${matchId}`, event as string, data);
}

/** Resolve the effective settings for a round (per-round override or default). */
function settingsForRound(
  defaults: TournamentSettings,
  roundSettings: Record<string, TournamentSettings>,
  round: number
): TournamentSettings {
  return roundSettings?.[String(round)] ?? defaults;
}

async function handleCreate(body: ActionBody<"create-tournament">, res: VercelResponse) {
  const { organizerId, name, format, settings } = body;
  const result = await createTournament(organizerId, name.substring(0, 60), format ?? "individual", settings);
  return res.status(200).json({ success: true, tournament: result.tournament });
}

async function handleJoin(body: ActionBody<"join-tournament">, res: VercelResponse) {
  const { code, participantId, name } = body;
  const result = await joinTournament(code, participantId, name.substring(0, 20));
  if (!result.ok || !result.tournament) {
    return apiError(res, 400, result.error ?? "Unable to join tournament");
  }

  const participant = result.tournament.participants.find(p => p.participantId === participantId);
  if (participant) {
    await triggerTournamentEvent(result.tournament.id, "participant-joined", { participant });
  }

  return res.status(200).json({
    success: true,
    tournamentId: result.tournament.id,
    tournament: result.tournament,
  });
}

async function handleLeave(body: ActionBody<"leave-tournament">, res: VercelResponse) {
  const { tournamentId, participantId } = body;
  await leaveTournament(tournamentId, participantId);
  await triggerTournamentEvent(tournamentId, "participant-left", { participantId });
  return res.status(200).json({ success: true });
}

async function handleKick(body: ActionBody<"kick-participant">, res: VercelResponse) {
  const { tournamentId, organizerId, targetId } = body;
  const result = await kickParticipant(tournamentId, organizerId, targetId);
  if (!result.ok) {
    const status = result.error === "Tournament not found" ? 404
      : result.error === "Only the organizer can remove participants" ? 403
      : 400;
    return apiError(res, status, result.error ?? "Unable to remove participant");
  }
  await triggerTournamentEvent(tournamentId, "participant-kicked", { participantId: targetId });
  return res.status(200).json({ success: true, tournament: result.tournament });
}

async function handleSeed(body: ActionBody<"seed-bracket">, res: VercelResponse) {
  const { tournamentId, organizerId, mode, participantOrder } = body;

  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    return apiError(res, 404, "Tournament not found");
  }
  if (tournament.participants.length < 2) {
    return apiError(res, 400, "Need at least 2 participants to seed the bracket");
  }

  // Adaptive bracket: when the field isn't a power of two, the lowest seeds play
  // a small play-in round that trims it down to `base`, so the MAIN bracket is
  // always full — no instant-win byes (NCAA "First Four" style). buildSeedRound
  // returns the play-in round when needed, otherwise the full first round. Auto
  // seeds by the participant/team list order; manual supplies the organizer's
  // custom seed order. Team brackets seed over team ids instead of player ids.
  const isTeams = tournament.format === "teams";
  const entrantIds = isTeams
    ? tournament.teams.map(t => t.teamId)
    : tournament.participants.map(p => p.participantId);
  if (entrantIds.length < 2) {
    return apiError(res, 400, isTeams ? "Form at least 2 teams first" : "Need at least 2 participants");
  }
  const ids =
    mode === "manual" && participantOrder && participantOrder.length > 0
      ? participantOrder
      : entrantIds;
  const matches = buildSeedRound(ids);

  const result = await seedBracket(tournamentId, organizerId, matches);
  if (!result.ok || !result.tournament) {
    const status = result.error === "Only the organizer can seed the bracket" ? 403 : 400;
    return apiError(res, status, result.error ?? "Unable to seed bracket");
  }

  await triggerTournamentEvent(tournamentId, "bracket-seeded", { tournament: result.tournament });
  return res.status(200).json({ success: true, tournament: result.tournament });
}

async function handleFormTeams(body: ActionBody<"form-teams">, res: VercelResponse) {
  const { tournamentId, organizerId, teams } = body;
  const result = await formTeams(tournamentId, organizerId, teams);
  if (!result.ok || !result.tournament) {
    const status = result.error === "Only the organizer can form teams" ? 403 : 400;
    return apiError(res, status, result.error ?? "Unable to form teams");
  }
  await triggerTournamentEvent(tournamentId, "teams-formed", { tournament: result.tournament });
  return res.status(200).json({ success: true, tournament: result.tournament });
}

async function handleSetRoundSettings(body: ActionBody<"set-round-settings">, res: VercelResponse) {
  const { tournamentId, organizerId, round, settings } = body;
  const result = await setRoundSettings(tournamentId, organizerId, round, settings);
  if (!result.ok || !result.tournament) {
    const status = result.error === "Only the organizer can change round settings" ? 403 : 400;
    return apiError(res, status, result.error ?? "Unable to set round settings");
  }
  await triggerTournamentEvent(tournamentId, "round-settings-updated", {
    round,
    roundSettings: result.tournament.roundSettings,
  });
  return res.status(200).json({ success: true, tournament: result.tournament });
}

async function handleStartRound(body: ActionBody<"start-round">, res: VercelResponse) {
  const { tournamentId, organizerId, round } = body;

  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    return apiError(res, 404, "Tournament not found");
  }

  const settings = settingsForRound(tournament.settings, tournament.roundSettings, round);
  const questions = generateQuestions(settings.operation, settings.selectedNumbers, settings.questionCount);

  const result = await startRound(tournamentId, organizerId, round, questions, settings);
  if (!result.ok || !result.tournament) {
    const status = result.error === "Only the organizer can start a round" ? 403 : 400;
    return apiError(res, status, result.error ?? "Unable to start round");
  }

  await triggerTournamentEvent(tournamentId, "round-started", {
    round,
    tournament: result.tournament,
    questions,
  });
  return res.status(200).json({ success: true, tournament: result.tournament });
}

async function handleUpdateMatchProgress(body: ActionBody<"update-match-progress">, res: VercelResponse) {
  const { matchId, participantId, currentQuestion } = body;
  // Persist (durable analytics) and relay to the opponent on the match channel.
  await updateMatchProgress(matchId, participantId, currentQuestion);
  await triggerMatchEvent(matchId, "match-progress", { participantId, currentQuestion });
  return res.status(200).json({ success: true });
}

async function handleSubmitMatch(body: ActionBody<"submit-match">, res: VercelResponse) {
  const { tournamentId, matchId, participantId, answers, score } = body;
  const result = await submitMatch(matchId, participantId, answers, score);
  if (!result.ok) {
    return apiError(res, 400, result.error ?? "Unable to submit match");
  }

  await triggerMatchEvent(matchId, "match-opponent-finished", { participantId, score });

  if (result.matchFinished) {
    await triggerTournamentEvent(tournamentId, "match-finished", {
      matchId,
      winnerId: result.winnerId,
      round: result.round ?? 0,
    });
  }

  return res.status(200).json({
    success: true,
    matchFinished: result.matchFinished,
    winnerId: result.winnerId,
  });
}

async function handleAdvanceRound(body: ActionBody<"advance-round">, res: VercelResponse) {
  const { tournamentId, organizerId } = body;

  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    return apiError(res, 404, "Tournament not found");
  }

  const round = tournament.currentRound;
  const entrantIds =
    tournament.format === "teams"
      ? tournament.teams.map(t => t.teamId)
      : tournament.participants.map(p => p.participantId);
  const plan = planBracket(entrantIds.length);

  // Winners of the current round, ordered by slot.
  const winnersBySlot = tournament.matches
    .filter(m => m.round === round)
    .sort((a, b) => a.slot - b.slot)
    .map(m => m.winnerId);

  // Advancing OUT of the play-in round assembles the full round-of-`base` from
  // the top seeds (direct entrants) + the play-in winners. Otherwise pair the
  // round's winners; an empty next round means the final just finished (crown).
  let nextMatches: BracketMatch[];
  if (round === 1 && plan.playInCount > 0) {
    nextMatches = buildRoundOfBase(2, entrantIds, winnersBySlot);
  } else if (winnersBySlot.length <= 1) {
    nextMatches = [];
  } else {
    nextMatches = buildNextRound(round, winnersBySlot);
  }

  const result = await advanceRound(tournamentId, organizerId, nextMatches);
  if (!result.ok || !result.tournament) {
    const status = result.error === "Only the organizer can advance the bracket" ? 403 : 400;
    return apiError(res, status, result.error ?? "Unable to advance round");
  }

  if (result.finished) {
    await triggerTournamentEvent(tournamentId, "tournament-finished", {
      championId: result.championId ?? null,
      tournament: result.tournament,
    });
  } else {
    await triggerTournamentEvent(tournamentId, "round-advanced", { tournament: result.tournament });
  }

  return res.status(200).json({
    success: true,
    finished: result.finished,
    championId: result.championId,
    tournament: result.tournament,
  });
}

// GET = late-join / refresh snapshot: the tournament plus live match states for
// the current round (powers the organizer dashboard after a reload).
async function handleGet(req: VercelRequest, res: VercelResponse) {
  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : "";
  if (!tournamentId) {
    return apiError(res, 400, "tournamentId is required");
  }
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    return apiError(res, 404, "Tournament not found");
  }
  const liveStates = await getLiveStates(tournamentId, tournament.currentRound);
  return res.status(200).json({ success: true, tournament, liveStates });
}

// Main handler - routes by action parameter
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method === "GET") {
      return await handleGet(req, res);
    }

    if (req.method !== "POST") {
      return apiError(res, 405, "Method not allowed");
    }

    const body = validate(TournamentActionSchema, req.body);
    const { action } = body;

    try {
      switch (action) {
        case "create-tournament":
          return await handleCreate(body, res);
        case "join-tournament":
          return await handleJoin(body, res);
        case "leave-tournament":
          return await handleLeave(body, res);
        case "kick-participant":
          return await handleKick(body, res);
        case "seed-bracket":
          return await handleSeed(body, res);
        case "form-teams":
          return await handleFormTeams(body, res);
        case "set-round-settings":
          return await handleSetRoundSettings(body, res);
        case "start-round":
          return await handleStartRound(body, res);
        case "update-match-progress":
          return await handleUpdateMatchProgress(body, res);
        case "submit-match":
          return await handleSubmitMatch(body, res);
        case "advance-round":
          return await handleAdvanceRound(body, res);
        default:
          return apiError(res, 400, `Unknown action: ${action}`);
      }
    } catch (error) {
      return handleApiError(res, "api/tournament", `Action "${action}" failed`, error);
    }
  } catch (error) {
    return handleApiError(res, "api/tournament", "Validation/routing failed", error);
  }
}
