import { getSupabase } from "../lib/api/db-pool.js";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { containsProfanity } from "../lib/api/profanity.js";
import { isScoreEligible } from "../lib/api/score-eligibility.js";
import { getCurrentEasternMonthBounds } from "../lib/api/time-utils.js";
import { SubmitScoreSchema, validate } from "../lib/api/validation.js";
import { logger } from "../lib/api/logger.js";
import { rateLimitHit, getClientKey } from "../lib/api/rate-limit.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  logger.log("[api/submit-score] Function invoked.");
  try {
    if (req.method !== "POST") {
      return apiError(res, 405, "Method Not Allowed");
    }

    const {
      playerName,
      score,
      operationType,
      questionCount,
      selectedNumbersCount,
      allNumbersSelected,
    } = validate(SubmitScoreSchema, req.body);

    const clientKey = getClientKey(req);
    if (!(await rateLimitHit(`submit-score:${clientKey}`, 20, 60_000))) {
      return apiError(res, 429, "Too many requests. Please slow down.");
    }

    const eligible = isScoreEligible(
      operationType,
      questionCount,
      selectedNumbersCount,
      allNumbersSelected
    );

    if (!eligible) {
      return apiError(res, 400, "Score is not eligible for the leaderboard (quiz settings do not meet requirements).");
    }

    logger.log(`[api/submit-score] Checking profanity for: "${playerName}"`);
    if (containsProfanity(playerName)) {
      logger.log(`[api/submit-score] Profanity DETECTED for: "${playerName}"`);
      return apiError(res, 400, "Inappropriate name detected. Please choose another.");
    }
    logger.log(`[api/submit-score] Profanity check PASSED for: "${playerName}"`);

    const supabase = getSupabase();
    const { startUtc, endUtc } = getCurrentEasternMonthBounds();

    const { data: existingRecords, error: checkError } = await supabase
      .from("leaderboard_scores")
      .select("id, score")
      .eq("player_name", playerName)
      .eq("operation_type", operationType)
      .gte("created_at", startUtc.toISOString())
      .lt("created_at", endUtc.toISOString())
      .order("score", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);

    if (checkError) {
      throw checkError;
    }

    let responseStatus = 201;
    let responsePayload = { message: "Score submitted successfully!" };

    if (existingRecords && existingRecords.length > 0) {
      const existingRecord = existingRecords[0];
      logger.log("[api/submit-score] Found current month record", existingRecord);
      if (score < existingRecord.score) {
        const { error: updateError } = await supabase
          .from("leaderboard_scores")
          .update({ score, created_at: new Date().toISOString() })
          .eq("id", existingRecord.id);

        if (updateError) {
          throw updateError;
        }
        responseStatus = 200;
        responsePayload = { message: "Score updated successfully!" };
      } else {
        responseStatus = 200;
        responsePayload = { message: "Existing score is better." };
      }
    } else {
      logger.log("[api/submit-score] No current month record, inserting new score");
      const { error: insertError } = await supabase
        .from("leaderboard_scores")
        .insert({
          player_name: playerName,
          score,
          operation_type: operationType,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        throw insertError;
      }
    }

    return res.status(responseStatus).json(responsePayload);
  } catch (error) {
    return handleApiError(res, "api/submit-score", "Validation/DB score submission failed", error);
  }
}
