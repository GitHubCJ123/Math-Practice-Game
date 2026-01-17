import { getSupabase } from "../lib/api/db-pool.js";
import { getCurrentEasternMonthBounds } from "../lib/api/time-utils.js";

const ALLOWED_OPERATIONS = new Set([
  "multiplication",
  "division",
  "squares",
  "square-roots",
  "fraction-to-decimal",
  "decimal-to-fraction",
  "fraction-to-percent",
  "percent-to-fraction",
  "negative-numbers",
]);

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

function isEligible(operationType: string, questionCount: number, selectedNumbersCount: number, allNumbersSelected: boolean) {
  const requiresAllNumbers = operationType === "multiplication" || operationType === "division" || operationType === "squares" || operationType === "square-roots" || operationType === "negative-numbers";
  const expectedCount = operationType === "squares" || operationType === "square-roots" ? 20 : operationType === "negative-numbers" ? 10 : 12;

  if (questionCount !== 10) {
    return false;
  }
  if (requiresAllNumbers) {
    return allNumbersSelected && selectedNumbersCount === expectedCount;
  }
  return true;
}

function getClientKey(req): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

export default async function handler(req, res) {
  console.log('[api/check-score] Function invoked.');
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { operationType, score, questionCount, selectedNumbersCount, allNumbersSelected } = req.query;
  const scoreNum = parseInt(score as string, 10);
  const questionCountNum = parseInt(questionCount as string, 10);
  const selectedNumbersCountNum = parseInt(selectedNumbersCount as string, 10);
  const allNumbersSelectedBool = (allNumbersSelected as string)?.toLowerCase() === 'true';

  if (!operationType || typeof operationType !== 'string' || Number.isNaN(scoreNum)) {
    return res.status(400).json({ message: 'operationType and a numeric score are required' });
  }

  if (!ALLOWED_OPERATIONS.has(operationType)) {
    return res.status(400).json({ message: 'Unsupported operationType' });
  }

  const clientKey = getClientKey(req);
  if (!allowRequest(clientKey)) {
    return res.status(429).json({ message: 'Too many requests. Please slow down.' });
  }

  const eligible = isEligible(
    operationType,
    questionCountNum,
    selectedNumbersCountNum,
    allNumbersSelectedBool
  );

  if (!eligible) {
    return res.status(200).json({ isTopScore: false, ineligible: true });
  }

  try {
    const { startUtc, endUtc } = getCurrentEasternMonthBounds();
    const supabase = getSupabase();

    // Get count of scores and count of scores better than submitted
    const { data, error } = await supabase
      .from('leaderboard_scores')
      .select('score')
      .eq('operation_type', operationType)
      .gte('created_at', startUtc.toISOString())
      .lt('created_at', endUtc.toISOString());

    if (error) {
      throw error;
    }

    const scores = data || [];
    const totalScores = scores.length;
    const betterScores = scores.filter(row => row.score < scoreNum).length;

    const isTopScore = totalScores < 5 || betterScores < 5;

    return res.status(200).json({ isTopScore });
  } catch (error) {
    console.error('[api/check-score] Error handling request', error);
    return res.status(500).json({ message: 'Error executing query', error: error.message });
  }
}
