import { Connection, Request, ConnectionConfiguration, TYPES } from "tedious";

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

    const now = new Date();
    // Go back one day to get to the last day of the previous month
    now.setDate(now.getDate() - 1); 
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // getMonth() is 0-indexed

    // This SQL query inserts the top 5 scores for each operation from the previous month into the HallOfFame.
    // It uses a Common Table Expression (CTE) with ROW_NUMBER() to rank scores for each operation type.
    const sql = `
      INSERT INTO HallOfFame (PlayerName, Score, OperationType, Month, Year)
      SELECT PlayerName, Score, OperationType, @month, @year
      FROM (
        SELECT 
          PlayerName, 
          Score, 
          OperationType,
          ROW_NUMBER() OVER(PARTITION BY OperationType ORDER BY Score ASC) as rn
        FROM LeaderboardScores
        WHERE 
          YEAR(CreatedAt) = @year AND 
          MONTH(CreatedAt) = @month
      ) as RankedScores
      WHERE rn <= 5;
    `;

    const request = new Request(sql, (err) => {
      if (err) {
        console.error("Cron job error during leaderboard archiving:", err);
        return res.status(500).json({ message: "Error archiving scores", error: err.message });
      }
      
      console.log('Leaderboard scores for month', month, 'and year', year, 'archived successfully.');
      res.status(200).json({ message: "Scores archived successfully." });
      connection.close();
    });

    request.addParameter('year', TYPES.Int, year);
    request.addParameter('month', TYPES.Int, month);
    connection.execSql(request);
  });

  connection.connect();
}
