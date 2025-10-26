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
      SELECT TOP 10 PlayerName, Score
      FROM LeaderboardScores
      WHERE OperationType = @operationType
      ORDER BY Score ASC;
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
