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
  console.log('[api/get-leaderboard] Function invoked.');
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { operationType } = req.query;

  if (!operationType || typeof operationType !== 'string') {
    return res.status(400).json({ message: 'operationType query parameter is required' });
  }

  const connection = new Connection(dbConfig);

  connection.on("connect", (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Error connecting to database", error: err.message });
    }

    const sql = `
      DECLARE @UtcNow DATETIMEOFFSET = SYSUTCDATETIME();
      DECLARE @EasternNow DATETIMEOFFSET = @UtcNow AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time';
      DECLARE @MonthStartEastern DATETIMEOFFSET = (CAST(DATEFROMPARTS(DATEPART(YEAR, @EasternNow), DATEPART(MONTH, @EasternNow), 1) AS DATETIME2) AT TIME ZONE 'Eastern Standard Time');
      DECLARE @NextMonthStartEastern DATETIMEOFFSET = DATEADD(MONTH, 1, @MonthStartEastern);
      DECLARE @MonthStartUtc DATETIME2 = CAST(SWITCHOFFSET(@MonthStartEastern, '+00:00') AS DATETIME2);
      DECLARE @NextMonthStartUtc DATETIME2 = CAST(SWITCHOFFSET(@NextMonthStartEastern, '+00:00') AS DATETIME2);

      SELECT TOP 5 PlayerName, Score
      FROM LeaderboardScores
      WHERE 
        OperationType = @operationType AND
        CreatedAt >= @MonthStartUtc AND
        CreatedAt < @NextMonthStartUtc
      ORDER BY Score ASC, CreatedAt ASC;
    `;

    const request = new Request(sql, (err, rowCount, rows) => {
      if (err) {
        return res.status(500).json({ message: "Error executing query", error: err.message });
      }

      const leaderboard = rows.map(row => ({
        playerName: row[0].value,
        score: row[1].value
      }));

      res.status(200).json(leaderboard);
      connection.close();
    });

    request.addParameter('operationType', TYPES.NVarChar, operationType);
    connection.execSql(request);
  });

  connection.connect();
}
