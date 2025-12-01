import sql from "mssql";
import { getPool } from "./db-pool.js";
import { getCurrentEasternMonthBounds, getPreviousEasternMonthBounds } from "./time-utils.js";
import { clearHallOfFameDatesCache } from "./get-hall-of-fame-dates.js";
import { clearLeaderboardCache } from "./get-leaderboard.js";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Vercel Cron jobs include the `x-vercel-cron` header instead of a custom Authorization token.
  // We still allow the legacy bearer secret so the job can be triggered manually if needed.
  const vercelCronHeader = req.headers['x-vercel-cron'];
  const hasVercelCronHeader = typeof vercelCronHeader === 'string';
  const bearer = req.headers.authorization;
  const hasValidBearer = typeof bearer === 'string' && bearer === `Bearer ${process.env.CRON_SECRET}`;

  if (!hasVercelCronHeader && !hasValidBearer) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { startUtc: previousMonthStartUtc, endUtc: previousMonthEndUtc, year, month } = getPreviousEasternMonthBounds();
  const { startUtc: currentMonthStartUtc } = getCurrentEasternMonthBounds();

  let transaction: sql.Transaction | null = null;

  try {
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const request = new sql.Request(transaction);
    request.input('previousMonthStartUtc', sql.DateTime2, previousMonthStartUtc);
    request.input('previousMonthEndUtc', sql.DateTime2, previousMonthEndUtc);
    request.input('currentMonthStartUtc', sql.DateTime2, currentMonthStartUtc);
    request.input('archiveMonth', sql.Int, month);
    request.input('archiveYear', sql.Int, year);

    await request.batch(`
      -- Archive previous month's champions into HallOfFame
      WITH RankedPreviousMonth AS (
        SELECT
          PlayerName,
          Score,
          OperationType,
          ROW_NUMBER() OVER (
            PARTITION BY OperationType
            ORDER BY Score ASC, CreatedAt ASC, Id ASC
          ) AS rn
        FROM LeaderboardScores
        WHERE CreatedAt >= @previousMonthStartUtc
          AND CreatedAt < @previousMonthEndUtc
      )
      INSERT INTO HallOfFame (PlayerName, Score, OperationType, Month, Year)
      SELECT PlayerName, Score, OperationType, @archiveMonth, @archiveYear
      FROM RankedPreviousMonth
      WHERE rn = 1
        AND NOT EXISTS (
          SELECT 1
          FROM HallOfFame h
          WHERE h.OperationType = RankedPreviousMonth.OperationType
            AND h.Month = @archiveMonth
            AND h.Year = @archiveYear
        );

      -- Backfill any missing historical champions before the current month
      WITH MonthlyWinners AS (
        SELECT
          PlayerName,
          Score,
          OperationType,
          DATEPART(YEAR, (CreatedAt AT TIME ZONE 'UTC') AT TIME ZONE 'Eastern Standard Time') AS WinnerYear,
          DATEPART(MONTH, (CreatedAt AT TIME ZONE 'UTC') AT TIME ZONE 'Eastern Standard Time') AS WinnerMonth,
          ROW_NUMBER() OVER (
            PARTITION BY OperationType,
              DATEPART(YEAR, (CreatedAt AT TIME ZONE 'UTC') AT TIME ZONE 'Eastern Standard Time'),
              DATEPART(MONTH, (CreatedAt AT TIME ZONE 'UTC') AT TIME ZONE 'Eastern Standard Time')
            ORDER BY Score ASC, CreatedAt ASC, Id ASC
          ) AS rn
        FROM LeaderboardScores
        WHERE CreatedAt < @currentMonthStartUtc
      )
      INSERT INTO HallOfFame (PlayerName, Score, OperationType, Month, Year)
      SELECT PlayerName, Score, OperationType, WinnerMonth, WinnerYear
      FROM MonthlyWinners
      WHERE rn = 1
        AND NOT EXISTS (
          SELECT 1
          FROM HallOfFame h
          WHERE h.OperationType = MonthlyWinners.OperationType
            AND h.Month = MonthlyWinners.WinnerMonth
            AND h.Year = MonthlyWinners.WinnerYear
        );

      -- Remove scores from previous months so only the active month remains
      DELETE FROM LeaderboardScores
      WHERE CreatedAt < @currentMonthStartUtc;

      -- Keep the current leaderboard lean by retaining only the top 15 per operation
      WITH RankedScores AS (
        SELECT
          Id,
          ROW_NUMBER() OVER (
            PARTITION BY OperationType
            ORDER BY Score ASC, CreatedAt ASC, Id ASC
          ) AS rn
        FROM LeaderboardScores
      )
      DELETE FROM LeaderboardScores
      WHERE Id IN (
        SELECT Id
        FROM RankedScores
        WHERE rn > 15
      );
    `);

    await transaction.commit();
    clearHallOfFameDatesCache();
    clearLeaderboardCache();

    console.log('Leaderboard maintenance completed successfully.');
    return res.status(200).json({ message: 'Scores archived successfully.' });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/archive-scores] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/archive-scores] Error running maintenance', error);
    return res.status(500).json({ message: 'Error archiving scores', error: error.message });
  }
}
