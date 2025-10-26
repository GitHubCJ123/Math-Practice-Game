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
      SELECT 
        (SELECT COUNT(*) FROM LeaderboardScores WHERE OperationType = @operationType) as totalScores,
        (SELECT COUNT(*) FROM LeaderboardScores WHERE OperationType = @operationType AND Score < @score) as betterScores;
    `;

    const request = new Request(sql, (err, rowCount, rows) => {
      if (err) {
        return res.status(500).json({ message: "Error executing query", error: err.message });
      }

      const totalScores = rows[0][0].value;
      const betterScores = rows[0][1].value;

      const isTopScore = totalScores < 10 || betterScores < 10;

      res.status(200).json({ isTopScore });
      connection.close();
    });

    request.addParameter('operationType', TYPES.NVarChar, operationType);
    request.addParameter('score', TYPES.Int, scoreNum);
    connection.execSql(request);
  });

  connection.connect();
}
