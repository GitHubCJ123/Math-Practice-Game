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
  console.log('[api/check-score] Function invoked.');
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { operationType, score } = req.query;
  const scoreNum = parseInt(score as string, 10);

  if (!operationType || typeof operationType !== 'string' || isNaN(scoreNum)) {
    return res.status(400).json({ message: 'operationType and a numeric score are required' });
  }

  const connection = new Connection(dbConfig);

  connection.on('connect', (err) => {
    if (err) {
      return res.status(500).json({ message: "Error connecting to database", error: err.message });
    }

    const sql = `
      DECLARE @UtcNow DATETIMEOFFSET = SYSUTCDATETIME();
      DECLARE @EasternNow DATETIMEOFFSET = @UtcNow AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time';
      DECLARE @MonthStartEastern DATETIMEOFFSET = (DATEFROMPARTS(DATEPART(YEAR, @EasternNow), DATEPART(MONTH, @EasternNow), 1) AT TIME ZONE 'Eastern Standard Time');
      DECLARE @NextMonthStartEastern DATETIMEOFFSET = DATEADD(MONTH, 1, @MonthStartEastern);
      DECLARE @MonthStartUtc DATETIME2 = CAST(SWITCHOFFSET(@MonthStartEastern, '+00:00') AS DATETIME2);
      DECLARE @NextMonthStartUtc DATETIME2 = CAST(SWITCHOFFSET(@NextMonthStartEastern, '+00:00') AS DATETIME2);

      SELECT 
        (
          SELECT COUNT(*) 
          FROM LeaderboardScores 
          WHERE OperationType = @operationType
            AND CreatedAt >= @MonthStartUtc
            AND CreatedAt < @NextMonthStartUtc
        ) as totalScores,
        (
          SELECT COUNT(*) 
          FROM LeaderboardScores 
          WHERE OperationType = @operationType 
            AND Score < @score
            AND CreatedAt >= @MonthStartUtc
            AND CreatedAt < @NextMonthStartUtc
        ) as betterScores;
    `;

    const request = new Request(sql, (err, rowCount, rows) => {
      if (err) {
        return res.status(500).json({ message: "Error executing query", error: err.message });
      }

      const totalScores = rows[0][0].value;
      const betterScores = rows[0][1].value;

      const isTopScore = totalScores < 5 || betterScores < 5;

      res.status(200).json({ isTopScore });
      connection.close();
    });

    request.addParameter('operationType', TYPES.NVarChar, operationType);
    request.addParameter('score', TYPES.Int, scoreNum);
    connection.execSql(request);
  });

  connection.connect();
}
