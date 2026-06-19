import { apiError, handleApiError } from "../lib/api/errors.js";
import { PollActionSchema, validate } from "../lib/api/validation.js";
import { getPusher } from "../lib/api/pusher.js";
import { getSupabase } from "../lib/api/db-pool.js";
import { isValidAdminCode } from "../lib/api/admin-auth.js";
import { rateLimitHit, getClientKey } from "../lib/api/rate-limit.js";
import { logger } from "../lib/api/logger.js";
import {
  GLOBAL_BROADCAST_CHANNEL,
  GLOBAL_POLL_STARTED_EVENT,
  GLOBAL_POLL_VOTE_EVENT,
  GLOBAL_POLL_CLOSED_EVENT,
  type Poll,
  type PollOption,
  type PollVote,
  type PollClosed,
} from "../shared/types.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Admin polling. Starting and closing a poll are privileged (admin code checked
 * server-side); voting is open to everyone.
 *
 * Votes are RELAYED to every connected client (via the `poll-vote` event), so
 * each client aggregates the same stream into an identical live tally. On top of
 * that, the single active poll (question, options, running tally, closed flag) is
 * persisted in the shared `poll_state` table so a client that loads mid-poll can
 * GET the current state and join in — Pusher only delivers events fired after you
 * subscribe. Because the snapshot now lives in Postgres (not per-instance memory),
 * late joiners are consistent across serverless instances. A closed poll is shown
 * for 30s (final results) before it is hidden, then `mp_cleanup_expired()` drops it.
 */
const POLL_RETENTION_AFTER_CLOSE_MS = 30_000;

interface PollSnapshot {
  poll: Poll | null;
  tallies: Record<string, number>;
  closed: boolean;
  closedAt: number | null;
}

async function pollGet(): Promise<PollSnapshot | null> {
  const { data, error } = await getSupabase().rpc("poll_get");
  if (error) {
    console.error("[api/poll] poll_get rpc failed:", error);
    return null;
  }
  return (data as PollSnapshot | null) ?? null;
}

async function pollStart(poll: Poll): Promise<void> {
  const { error } = await getSupabase().rpc("poll_start", { p_poll: poll });
  if (error) throw new Error(error.message);
}

async function pollVote(pollId: string, optionId: string): Promise<void> {
  const { error } = await getSupabase().rpc("poll_vote", { p_poll_id: pollId, p_option_id: optionId });
  if (error) console.error("[api/poll] poll_vote rpc failed:", error);
}

async function pollClose(pollId: string): Promise<void> {
  const { error } = await getSupabase().rpc("poll_close", { p_poll_id: pollId });
  if (error) throw new Error(error.message);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  logger.log("[api/poll] Function invoked.");

  try {
    // Late-join snapshot: a client loading mid-poll asks for the current state
    // so the poll shows up immediately (Pusher only replays nothing on join).
    if (req.method === "GET") {
      const active = await pollGet();
      if (
        !active ||
        !active.poll ||
        (active.closed &&
          active.closedAt !== null &&
          Date.now() - active.closedAt > POLL_RETENTION_AFTER_CLOSE_MS)
      ) {
        return res.status(200).json({ poll: null });
      }
      return res.status(200).json({
        poll: active.poll,
        tallies: active.tallies,
        closed: active.closed,
        closedAt: active.closedAt,
      });
    }

    if (req.method !== "POST") {
      return apiError(res, 405, "Method Not Allowed");
    }

    if (!(await rateLimitHit(`poll:${getClientKey(req)}`, 60, 60_000))) {
      return apiError(res, 429, "Too many requests. Please slow down.");
    }

    const body = validate(PollActionSchema, req.body);

    if (body.action === "start") {
      // Server-side authorization: the privileged action is gated here, not
      // just in the client UI.
      if (!isValidAdminCode(body.code)) {
        return apiError(res, 401, "Invalid admin code.");
      }

      // Cap how many polls one admin/IP can START per minute (separate from the
      // general per-IP poll limit above, which also covers votes/closes).
      if (!(await rateLimitHit(`poll-start:${getClientKey(req)}`, 5, 60_000))) {
        return apiError(res, 429, "Too many requests. Please slow down.");
      }

      const options: PollOption[] = body.options.map((text, index) => ({
        id: `opt_${index}_${Math.random().toString(36).slice(2, 7)}`,
        text,
      }));
      const poll: Poll = {
        id: `poll_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        question: body.question,
        options,
        startedAt: Date.now(),
      };

      await pollStart(poll);

      await getPusher().trigger(GLOBAL_BROADCAST_CHANNEL, GLOBAL_POLL_STARTED_EVENT, poll);
      logger.log(`[api/poll] Poll started: options=${options.length}`);
      return res.status(201).json({ ok: true, poll });
    }

    if (body.action === "vote") {
      // Persist the tally so late joiners get an accurate count, then relay the
      // vote so connected clients converge on the same running total.
      await pollVote(body.pollId, body.optionId);
      const vote: PollVote = { pollId: body.pollId, optionId: body.optionId };
      await getPusher().trigger(GLOBAL_BROADCAST_CHANNEL, GLOBAL_POLL_VOTE_EVENT, vote);
      return res.status(202).json({ ok: true });
    }

    // action === "close"
    if (!isValidAdminCode(body.code)) {
      return apiError(res, 401, "Invalid admin code.");
    }
    await pollClose(body.pollId);
    const closed: PollClosed = { pollId: body.pollId };
    await getPusher().trigger(GLOBAL_BROADCAST_CHANNEL, GLOBAL_POLL_CLOSED_EVENT, closed);
    logger.log("[api/poll] Poll closed.");
    return res.status(200).json({ ok: true });
  } catch (error) {
    return handleApiError(res, "api/poll", "Poll request failed", error);
  }
}
