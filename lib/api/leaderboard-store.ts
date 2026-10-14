import { getSupabase } from "./db-pool.js";
import { getCurrentEasternMonthBounds } from "./time-utils.js";

/** Current-month leaderboard reads/writes used by api/submit-score.ts. */

const LEADERBOARD_SIZE = 5;

/** Whether `scoreMs` would place in this month's top 5 for the operation. */
export async function isTopFiveScore(operationType: string, scoreMs: number): Promise<boolean> {
  const { startUtc, endUtc } = getCurrentEasternMonthBounds();
  const { count, error } = await getSupabase()
    .from("leaderboard_scores")
    .select("id", { count: "exact", head: true })
    .eq("operation_type", operationType)
    .gte("created_at", startUtc.toISOString())
    .lt("created_at", endUtc.toISOString())
    .lt("score", scoreMs);

  if (error) throw error;
  return (count ?? 0) < LEADERBOARD_SIZE;
}

export type SaveScoreOutcome = "inserted" | "updated" | "kept";

/**
 * Stores a verified score, keeping only each player's best per operation per
 * month (same name replaces the old score only when the new one is faster).
 */
export async function saveBestScore(
  playerName: string,
  operationType: string,
  scoreMs: number
): Promise<SaveScoreOutcome> {
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

  if (checkError) throw checkError;

  const existing = existingRecords?.[0];
  if (existing) {
    if (scoreMs >= existing.score) return "kept";
    const { error: updateError } = await supabase
      .from("leaderboard_scores")
      .update({ score: scoreMs, created_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return "updated";
  }

  const { error: insertError } = await supabase.from("leaderboard_scores").insert({
    player_name: playerName,
    score: scoreMs,
    operation_type: operationType,
    created_at: new Date().toISOString(),
  });
  if (insertError) throw insertError;
  return "inserted";
}
