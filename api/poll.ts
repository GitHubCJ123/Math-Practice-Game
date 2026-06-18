import { apiError, handleApiError } from "../lib/api/errors.js";
import { PollActionSchema, validate } from "../lib/api/validation.js";
import { getPusher } from "../lib/api/pusher.js";
import { isValidAdminCode } from "../lib/api/admin-auth.js";
import { createRateLimiter, getClientKey } from "../lib/api/rate-limit.js";
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
 * that the function keeps a LIGHTWEIGHT in-memory snapshot of the single active
 * poll (question, options, running tally, closed flag) purely so a client that
 * loads mid-poll can GET the current state and join in — Pusher only delivers
 * events fired after you subscribe. The snapshot is best-effort: like the
 * multiplayer rooms it lives per serverless instance, so connected clients stay
 * exact while late joiners may be approximate under multi-instance serverless.
 * A closed poll is retained for 30s (so latecomers still see the result), then
 * dropped on every device.
 */
interface ActivePollState {
  poll: Poll;
  tallies: Record<string, number>;
  closed: boolean;
  closedAt: number | null;
}

/** A closed poll lingers this long (showing final results) before it vanishes. */
const POLL_RETENTION_AFTER_CLOSE_MS = 30_000;

let activePoll: ActivePollState | null = null;

/** The live poll, expired 30s after it was closed. */
function currentPoll(): ActivePollState | null {
  if (
    activePoll &&
    activePoll.closed &&
    activePoll.closedAt !== null &&
    Date.now() - activePoll.closedAt > POLL_RETENTION_AFTER_CLOSE_MS
  ) {
    activePoll = null;
  }
  return activePoll;
}

const allowRequest = createRateLimiter({ windowMs: 60_000, max: 60 });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  logger.log("[api/poll] Function invoked.");

  try {
    // Late-join snapshot: a client loading mid-poll asks for the current state
    // so the poll shows up immediately (Pusher only replays nothing on join).
    if (req.method === "GET") {
      const active = currentPoll();
      if (!active) {
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

    if (!allowRequest(getClientKey(req))) {
      return apiError(res, 429, "Too many requests. Please slow down.");
    }

    const body = validate(PollActionSchema, req.body);

    if (body.action === "start") {
      // Server-side authorization: the privileged action is gated here, not
      // just in the client UI.
      if (!isValidAdminCode(body.code)) {
        return apiError(res, 401, "Invalid admin code.");
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

      activePoll = {
        poll,
        tallies: Object.fromEntries(options.map((o) => [o.id, 0])),
        closed: false,
        closedAt: null,
      };

      await getPusher().trigger(GLOBAL_BROADCAST_CHANNEL, GLOBAL_POLL_STARTED_EVENT, poll);
      logger.log(`[api/poll] Poll started: options=${options.length}`);
      return res.status(201).json({ ok: true, poll });
    }

    if (body.action === "vote") {
      // Keep the snapshot tally in sync so late joiners get an accurate count.
      const active = currentPoll();
      if (
        active &&
        active.poll.id === body.pollId &&
        Object.prototype.hasOwnProperty.call(active.tallies, body.optionId)
      ) {
        active.tallies[body.optionId] += 1;
      }
      const vote: PollVote = { pollId: body.pollId, optionId: body.optionId };
      await getPusher().trigger(GLOBAL_BROADCAST_CHANNEL, GLOBAL_POLL_VOTE_EVENT, vote);
      return res.status(202).json({ ok: true });
    }

    // action === "close"
    if (!isValidAdminCode(body.code)) {
      return apiError(res, 401, "Invalid admin code.");
    }
    const active = currentPoll();
    if (active && active.poll.id === body.pollId) {
      active.closed = true;
      active.closedAt = Date.now();
    }
    const closed: PollClosed = { pollId: body.pollId };
    await getPusher().trigger(GLOBAL_BROADCAST_CHANNEL, GLOBAL_POLL_CLOSED_EVENT, closed);
    logger.log("[api/poll] Poll closed.");
    return res.status(200).json({ ok: true });
  } catch (error) {
    return handleApiError(res, "api/poll", "Poll request failed", error);
  }
}
