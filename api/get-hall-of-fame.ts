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

  const { operationType, year, month } = req.query;

  if (!operationType || typeof operationType !== 'string' || !year || !month) {
    return res.status(400).json({ message: 'operationType, year, and month query parameters are required' });
  }

  const yearNum = parseInt(year as string, 10);
  const monthNum = parseInt(month as string, 10);

  if (isNaN(yearNum) || isNaN(monthNum)) {
    return res.status(400).json({ message: 'year and month must be valid numbers' });
  }

  const connection = new Connection(dbConfig);

  connection.on("connect", (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Error connecting to database", error: err.message });
    }

    const sql = `
      SELECT PlayerName, Score
      FROM HallOfFame
      WHERE OperationType = @operationType AND Year = @year AND Month = @month
      ORDER BY Score ASC;
    `;

    const request = new Request(sql, (err, rowCount, rows) => {
      if (err) {
        return res.status(500).json({ message: "Error executing query", error: err.message });
      }

      const hallOfFame = rows.map(row => ({
        playerName: row[0].value,
        score: row[1].value
      }));

      res.status(200).json(hallOfFame);
      connection.close();
    });

    request.addParameter('operationType', TYPES.NVarChar, operationType);
    request.addParameter('year', TYPES.Int, yearNum);
    request.addParameter('month', TYPES.Int, monthNum);
    connection.execSql(request);
  });

  connection.connect();
}
