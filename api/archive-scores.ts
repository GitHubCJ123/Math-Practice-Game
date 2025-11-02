import { Connection, Request, ConnectionConfiguration } from "tedious";

const dbConfig: ConnectionConfiguration = {
  server: process.env.AZURE_SERVER_NAME!,
  authentication: {
    type: "default",
    options: {
      userName: process.env.AZURE_DB_USER!,
      password: process.env.AZURE_DB_PASSWORD!,
    },
  },
  options: {
    encrypt: true,
    database: process.env.AZURE_DB_NAME!,
    rowCollectionOnRequestCompletion: true,
    connectTimeout: 30000
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Basic security check: Vercel Cron jobs send a secret header
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const connection = new Connection(dbConfig);

  connection.on("connect", (err) => {
    if (err) {
      console.error("Cron job DB connection error:", err);
      return res.status(500).json({ message: "Error connecting to database" });
    }

    // Calculate the previous month using US Eastern Time so the reset aligns with the
    // leaderboard countdown that players see. Only the champion for each operation
    // (fastest time) is archived into the HallOfFame table.
    const sql = `
      DECLARE @UtcNow DATETIMEOFFSET = SYSUTCDATETIME();
      DECLARE @EasternNow DATETIMEOFFSET = @UtcNow AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time';
      DECLARE @CurrentMonthStartEastern DATETIMEOFFSET = (DATEFROMPARTS(DATEPART(YEAR, @EasternNow), DATEPART(MONTH, @EasternNow), 1) AT TIME ZONE 'Eastern Standard Time');
      DECLARE @PreviousMonthStartEastern DATETIMEOFFSET = DATEADD(MONTH, -1, @CurrentMonthStartEastern);
      DECLARE @PreviousMonthEndEastern DATETIMEOFFSET = @CurrentMonthStartEastern;

      DECLARE @ArchiveYear INT = DATEPART(YEAR, @PreviousMonthStartEastern);
      DECLARE @ArchiveMonth INT = DATEPART(MONTH, @PreviousMonthStartEastern);

      DECLARE @PreviousMonthStartUtc DATETIME2 = CAST(SWITCHOFFSET(@PreviousMonthStartEastern, '+00:00') AS DATETIME2);
      DECLARE @PreviousMonthEndUtc DATETIME2 = CAST(SWITCHOFFSET(@PreviousMonthEndEastern, '+00:00') AS DATETIME2);

      WITH RankedScores AS (
        SELECT 
          PlayerName,
          Score,
          OperationType,
          ROW_NUMBER() OVER(PARTITION BY OperationType ORDER BY Score ASC, CreatedAt ASC) as rn
        FROM LeaderboardScores
        WHERE 
          CreatedAt >= @PreviousMonthStartUtc AND 
          CreatedAt < @PreviousMonthEndUtc
      )
      INSERT INTO HallOfFame (PlayerName, Score, OperationType, Month, Year)
      SELECT PlayerName, Score, OperationType, @ArchiveMonth, @ArchiveYear
      FROM RankedScores
      WHERE rn = 1
        AND NOT EXISTS (
          SELECT 1 FROM HallOfFame H
          WHERE H.OperationType = RankedScores.OperationType
            AND H.Month = @ArchiveMonth
            AND H.Year = @ArchiveYear
        );
    `;

    const request = new Request(sql, (err) => {
      if (err) {
        console.error("Cron job error during leaderboard archiving:", err);
        return res.status(500).json({ message: "Error archiving scores", error: err.message });
      }
      
      console.log('Leaderboard scores archived successfully for the previous Eastern Time month.');
      res.status(200).json({ message: "Scores archived successfully." });
      connection.close();
    });
    connection.execSql(request);
  });

  connection.connect();
}
