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
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const connection = new Connection(dbConfig);

  connection.on("connect", (err) => {
    if (err) {
      console.error("DB connection error:", err);
      return res.status(500).json({ message: "Error connecting to database", error: err.message });
    }

    const sql = `
      SELECT DISTINCT Year, Month
      FROM HallOfFame
      ORDER BY Year DESC, Month DESC;
    `;

    const request = new Request(sql, (err, rowCount, rows) => {
      if (err) {
        console.error("Error executing query:", err);
        return res.status(500).json({ message: "Error executing query", error: err.message });
      }

      const dates = rows.reduce((acc, row) => {
        const year = row[0].value;
        const month = row[1].value;
        if (!acc[year]) {
          acc[year] = [];
        }
        acc[year].push(month);
        return acc;
      }, {});

      res.status(200).json(dates);
      connection.close();
    });

    connection.execSql(request);
  });

  connection.connect();
}
