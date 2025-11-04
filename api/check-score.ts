import sql from "mssql";
import { getPool } from "./db-pool.js";
import { getCurrentEasternMonthBounds } from "./time-utils.js";

export default async function handler(req, res) {
  console.log('[api/check-score] Function invoked.');
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { operationType, score } = req.query;
  const scoreNum = parseInt(score as string, 10);

  if (!operationType || typeof operationType !== 'string' || Number.isNaN(scoreNum)) {
    return res.status(400).json({ message: 'operationType and a numeric score are required' });
  }

  try {
    const { startUtc, endUtc } = getCurrentEasternMonthBounds();
    const pool = await getPool();
    const request = pool.request();
    request.input('operationType', sql.NVarChar, operationType);
    request.input('score', sql.Int, scoreNum);
    request.input('monthStartUtc', sql.DateTime2, startUtc);
    request.input('nextMonthStartUtc', sql.DateTime2, endUtc);

    const result = await request.query(`
      SELECT
        SUM(CASE WHEN Score < @score THEN 1 ELSE 0 END) AS BetterScores,
        COUNT(*) AS TotalScores
      FROM LeaderboardScores
      WHERE OperationType = @operationType
        AND CreatedAt >= @monthStartUtc
        AND CreatedAt < @nextMonthStartUtc;
    `);

    const row = result.recordset[0] ?? { BetterScores: 0, TotalScores: 0 };
    const totalScores = row.TotalScores ?? 0;
    const betterScores = row.BetterScores ?? 0;

    const isTopScore = totalScores < 5 || betterScores < 5;

    return res.status(200).json({ isTopScore });
  } catch (error) {
    console.error('[api/check-score] Error handling request', error);
    return res.status(500).json({ message: 'Error executing query', error: error.message });
  }
}
