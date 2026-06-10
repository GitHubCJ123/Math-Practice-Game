import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabase } from "../lib/api/db-pool.js";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { getCurrentEasternMonthBounds, getPreviousEasternMonthBounds } from "../lib/api/time-utils.js";
import { logger } from "../lib/api/logger.js";


function safeCompare(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return apiError(res, 405, 'Method Not Allowed');
    }

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[api/archive-scores] CRON_SECRET is not configured.');
      return apiError(res, 503, 'Archive job is not configured.');
    }

    const bearer = req.headers.authorization;
    const expected = `Bearer ${cronSecret}`;
    const hasValidBearer = typeof bearer === 'string' && safeCompare(bearer, expected);

    if (!hasValidBearer) {
      return apiError(res, 401, 'Unauthorized');
    }

    const { startUtc: previousMonthStartUtc, endUtc: previousMonthEndUtc, year, month } = getPreviousEasternMonthBounds();
    const { startUtc: currentMonthStartUtc } = getCurrentEasternMonthBounds();

    const supabase = getSupabase();

    // Step 1: Get previous month's top scorers per operation type
    const { data: previousMonthScores, error: fetchError } = await supabase
      .from('leaderboard_scores')
      .select('*')
      .gte('created_at', previousMonthStartUtc.toISOString())
      .lt('created_at', previousMonthEndUtc.toISOString())
      .order('score', { ascending: true })
      .order('created_at', { ascending: true });

    if (fetchError) {
      throw fetchError;
    }

    // Group by operation type and get the winner (lowest score) for each
    const winnersByOperation = new Map<string, { player_name: string; score: number }>();
    for (const row of previousMonthScores || []) {
      if (!winnersByOperation.has(row.operation_type)) {
        winnersByOperation.set(row.operation_type, {
          player_name: row.player_name,
          score: row.score,
        });
      }
    }

    // Step 2: Batch-insert winners that aren't already in Hall of Fame
    // First, fetch all existing hall_of_fame entries for this month in one query
    const { data: existingHof, error: hofError } = await supabase
      .from('hall_of_fame')
      .select('operation_type')
      .eq('year', year)
      .eq('month', month);

    if (hofError) {
      throw hofError;
    }

    const existingOperations = new Set((existingHof || []).map(r => r.operation_type));
    const newWinners: { player_name: string; score: number; operation_type: string; month: number; year: number }[] = [];

    for (const [operationType, winner] of winnersByOperation) {
      if (!existingOperations.has(operationType)) {
        newWinners.push({
          player_name: winner.player_name,
          score: winner.score,
          operation_type: operationType,
          month: month,
          year: year,
        });
      }
    }

    if (newWinners.length > 0) {
      const { error: insertError } = await supabase
        .from('hall_of_fame')
        .insert(newWinners);

      if (insertError) {
        console.error(`[api/archive-scores] Error batch-inserting hall of fame winners`, insertError);
      }
    }

    // Step 3: Backfill any missing historical champions before the current month
    const { data: allHistoricalScores, error: historicalError } = await supabase
      .from('leaderboard_scores')
      .select('*')
      .lt('created_at', currentMonthStartUtc.toISOString())
      .order('score', { ascending: true })
      .order('created_at', { ascending: true });

    if (historicalError) {
      throw historicalError;
    }

    // Group historical scores by operation + year + month
    const historicalWinners = new Map<string, { player_name: string; score: number; year: number; month: number; operation_type: string }>();
    for (const row of allHistoricalScores || []) {
      const createdAt = new Date(row.created_at);
      // Convert to Eastern time for month/year calculation
      const easternDate = new Date(createdAt.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const rowYear = easternDate.getFullYear();
      const rowMonth = easternDate.getMonth() + 1; // JavaScript months are 0-indexed
      const key = `${row.operation_type}-${rowYear}-${rowMonth}`;
      
      if (!historicalWinners.has(key)) {
        historicalWinners.set(key, {
          player_name: row.player_name,
          score: row.score,
          year: rowYear,
          month: rowMonth,
          operation_type: row.operation_type,
        });
      }
    }

    // Insert missing historical winners in a single batch
    const backfillWinners: { player_name: string; score: number; operation_type: string; month: number; year: number }[] = [];

    // Fetch ALL existing hall_of_fame entries in one query to avoid N lookups
    const { data: allExistingHof, error: allHofError } = await supabase
      .from('hall_of_fame')
      .select('operation_type, year, month');

    if (allHofError) {
      throw allHofError;
    }

    const existingHofKeys = new Set((allExistingHof || []).map(r => `${r.operation_type}-${r.year}-${r.month}`));

    for (const [key, winner] of historicalWinners) {
      if (!existingHofKeys.has(key)) {
        backfillWinners.push({
          player_name: winner.player_name,
          score: winner.score,
          operation_type: winner.operation_type,
          month: winner.month,
          year: winner.year,
        });
      }
    }

    if (backfillWinners.length > 0) {
      const { error: backfillInsertError } = await supabase
        .from('hall_of_fame')
        .insert(backfillWinners);

      if (backfillInsertError) {
        console.error(`[api/archive-scores] Error batch-backfilling hall of fame`, backfillInsertError);
      }
    }

    // Step 4: Delete scores from previous months (keep only current month)
    const { error: deleteOldError } = await supabase
      .from('leaderboard_scores')
      .delete()
      .lt('created_at', currentMonthStartUtc.toISOString());

    if (deleteOldError) {
      throw deleteOldError;
    }

    // Step 5: Keep leaderboard lean - retain only top 15 per operation
    const { data: currentScores, error: currentError } = await supabase
      .from('leaderboard_scores')
      .select('id, operation_type, score, created_at')
      .order('score', { ascending: true })
      .order('created_at', { ascending: true });

    if (currentError) {
      throw currentError;
    }

    // Group by operation type and find IDs to delete (beyond top 15)
    const scoresByOperation = new Map<string, number[]>();
    for (const row of currentScores || []) {
      if (!scoresByOperation.has(row.operation_type)) {
        scoresByOperation.set(row.operation_type, []);
      }
      scoresByOperation.get(row.operation_type)!.push(row.id);
    }

    const idsToDelete: number[] = [];
    for (const [, ids] of scoresByOperation) {
      if (ids.length > 15) {
        idsToDelete.push(...ids.slice(15));
      }
    }

    if (idsToDelete.length > 0) {
      const { error: deleteExcessError } = await supabase
        .from('leaderboard_scores')
        .delete()
        .in('id', idsToDelete);

      if (deleteExcessError) {
        throw deleteExcessError;
      }
    }

    logger.log('Leaderboard maintenance completed successfully.');
    return res.status(200).json({ message: 'Scores archived successfully.' });
  } catch (error: unknown) {
    return handleApiError(res, "api/archive-scores", "Auth/DB archive maintenance failed", error);
  }
}
