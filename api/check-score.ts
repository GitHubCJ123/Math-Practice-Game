import { getSupabase } from "../lib/api/db-pool.js";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { isScoreEligible } from "../lib/api/score-eligibility.js";
import { getCurrentEasternMonthBounds } from "../lib/api/time-utils.js";
import { CheckScoreSchema, validate } from "../lib/api/validation.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimit = new Map<string, { count: number; resetAt: number }>();

function allowRequest(key: string) {
  const now = Date.now();
  const entry = rateLimit.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  entry.count += 1;
  return true;
}

function getClientKey(req: VercelRequest): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log("[api/check-score] Function invoked.");
  try {
    if (req.method !== "GET") {
      return apiError(res, 405, "Method Not Allowed");
    }

    const { operationType, score, questionCount, selectedNumbersCount, allNumbersSelected } = validate(CheckScoreSchema, req.query);

    const clientKey = getClientKey(req);
    if (!allowRequest(clientKey)) {
      return apiError(res, 429, "Too many requests. Please slow down.");
    }

    const eligible = isScoreEligible(
      operationType,
      questionCount,
      selectedNumbersCount,
      allNumbersSelected
    );

    if (!eligible) {
      return res.status(200).json({ isTopScore: false, ineligible: true });
    }

    const { startUtc, endUtc } = getCurrentEasternMonthBounds();
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("leaderboard_scores")
      .select("score")
      .eq("operation_type", operationType)
      .gte("created_at", startUtc.toISOString())
      .lt("created_at", endUtc.toISOString());

    if (error) {
      throw error;
    }

    const scores = data || [];
    const totalScores = scores.length;
    const betterScores = scores.filter((row) => row.score < score).length;

    const isTopScore = totalScores < 5 || betterScores < 5;

    return res.status(200).json({ isTopScore });
  } catch (error) {
    return handleApiError(res, "api/check-score", "Validation/DB score check failed", error);
  }
}
