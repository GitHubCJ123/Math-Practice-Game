-- Manually archive December 2025 champions to Hall of Fame
-- December 2025 boundaries in EST: Dec 1, 2025 00:00 to Jan 1, 2026 00:00 EST
DECLARE @decemberStartEst DATETIME2 = '2025-12-01 00:00:00';
DECLARE @decemberEndEst DATETIME2 = '2026-01-01 00:00:00';

WITH RankedDecemberScores AS (
  SELECT
    PlayerName,
    Score,
    OperationType,
    ROW_NUMBER() OVER (
      PARTITION BY OperationType
      ORDER BY Score ASC, CreatedAt ASC, Id ASC
    ) AS rn
  FROM LeaderboardScores
  WHERE CreatedAt >= @decemberStartEst
    AND CreatedAt < @decemberEndEst
)
INSERT INTO HallOfFame (PlayerName, Score, OperationType, Month, Year)
SELECT PlayerName, Score, OperationType, 12, 2025
FROM RankedDecemberScores
WHERE rn = 1
  AND NOT EXISTS (
    SELECT 1
    FROM HallOfFame h
    WHERE h.OperationType = RankedDecemberScores.OperationType
      AND h.Month = 12
      AND h.Year = 2025
  );
