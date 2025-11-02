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

    // This SQL query calculates the previous month using US Eastern Time so the reset aligns with the
    // leaderboard countdown that players see. It then inserts the top 5 scores for each operation from
    // that period into the HallOfFame table.
    const sql = `
      DECLARE @EasternNow DATETIMEOFFSET = SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time';
      DECLARE @ArchivePoint DATETIMEOFFSET = DATEADD(MONTH, -1, @EasternNow);
      DECLARE @ArchiveYear INT = DATEPART(YEAR, @ArchivePoint);
      DECLARE @ArchiveMonth INT = DATEPART(MONTH, @ArchivePoint);

      WITH RankedScores AS (
        SELECT 
          PlayerName,
          Score,
          OperationType,
          ROW_NUMBER() OVER(PARTITION BY OperationType ORDER BY Score ASC) as rn
        FROM LeaderboardScores
        WHERE 
          DATEPART(YEAR, (CreatedAt AT TIME ZONE 'UTC') AT TIME ZONE 'Eastern Standard Time') = @ArchiveYear AND 
          DATEPART(MONTH, (CreatedAt AT TIME ZONE 'UTC') AT TIME ZONE 'Eastern Standard Time') = @ArchiveMonth
      )
      INSERT INTO HallOfFame (PlayerName, Score, OperationType, Month, Year)
      SELECT PlayerName, Score, OperationType, @ArchiveMonth, @ArchiveYear
      FROM RankedScores
      WHERE rn <= 5;
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
