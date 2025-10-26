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

// Simple profanity filter
const badWords = ['word1', 'word2', 'word3']; // Add more words as needed
const isProfane = (text) => {
  const words = text.toLowerCase().split(/\s+/);
  return words.some(word => badWords.includes(word));
};


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  
  const { playerName, score, operationType } = req.body;
  const scoreNum = parseInt(score, 10);

  if (!playerName || typeof playerName !== 'string' || playerName.length > 50 || playerName.length < 1) {
    return res.status(400).json({ message: 'Valid playerName is required.' });
  }
  if (!operationType || typeof operationType !== 'string' || isNaN(scoreNum)) {
    return res.status(400).json({ message: 'operationType and a numeric score are required.' });
  }

  if (isProfane(playerName)) {
    return res.status(400).json({ message: 'Inappropriate name detected. Please choose another.' });
  }

  const connection = new Connection(dbConfig);

  connection.on('connect', (err) => {
    if (err) return res.status(500).json({ message: "DB Connection Error", error: err.message });

    connection.beginTransaction(err => {
      if (err) return res.status(500).json({ message: "Transaction Error", error: err.message });

      const checkExistingSql = `
        SELECT Score FROM LeaderboardScores 
        WHERE PlayerName = @playerName COLLATE SQL_Latin1_General_CP1_CI_AS 
        AND OperationType = @operationType;
      `;

      const request = new Request(checkExistingSql, (err, rowCount, rows) => {
        if (err) {
          connection.rollbackTransaction(() => res.status(500).json({ message: "DB Error", error: err.message }));
          return;
        }

        const existingScore = rowCount > 0 ? rows[0][0].value : null;

        if (existingScore !== null) { // Player exists
          if (scoreNum < existingScore) { // New score is better
            const updateSql = `
              UPDATE LeaderboardScores SET Score = @score 
              WHERE PlayerName = @playerName COLLATE SQL_Latin1_General_CP1_CI_AS 
              AND OperationType = @operationType;
            `;
            const updateRequest = new Request(updateSql, (err) => {
              if (err) return connection.rollbackTransaction(() => res.status(500).json({ message: "DB Error", error: err.message }));
              connection.commitTransaction(err => {
                if (err) return connection.rollbackTransaction(() => res.status(500).json({ message: "DB Error", error: err.message }));
                res.status(200).json({ message: 'Score updated successfully!' });
                connection.close();
              });
            });
            updateRequest.addParameter('score', TYPES.Int, scoreNum);
            updateRequest.addParameter('playerName', TYPES.NVarChar, playerName);
            updateRequest.addParameter('operationType', TYPES.NVarChar, operationType);
            connection.execSql(updateRequest);
          } else { // New score is not better
            connection.commitTransaction(err => {
                if (err) return connection.rollbackTransaction(() => res.status(500).json({ message: "DB Error", error: err.message }));
                res.status(200).json({ message: 'Existing score is better.' });
                connection.close();
            });
          }
        } else { // New player
          const insertSql = `
            INSERT INTO LeaderboardScores (PlayerName, Score, OperationType) 
            VALUES (@playerName, @score, @operationType);
          `;
          const insertRequest = new Request(insertSql, (err) => {
            if (err) return connection.rollbackTransaction(() => res.status(500).json({ message: "DB Error", error: err.message }));
            
            const trimSql = `
              WITH CTE AS (
                SELECT Id, ROW_NUMBER() OVER (ORDER BY Score ASC) as rn 
                FROM LeaderboardScores WHERE OperationType = @operationType
              )
              DELETE FROM LeaderboardScores WHERE Id IN (SELECT Id FROM CTE WHERE rn > 10);
            `;
            const trimRequest = new Request(trimSql, (err) => {
               if (err) return connection.rollbackTransaction(() => res.status(500).json({ message: "DB Error", error: err.message }));
               connection.commitTransaction(err => {
                  if (err) return connection.rollbackTransaction(() => res.status(500).json({ message: "DB Error", error: err.message }));
                  res.status(201).json({ message: 'Score submitted successfully!' });
                  connection.close();
               });
            });
            trimRequest.addParameter('operationType', TYPES.NVarChar, operationType);
            connection.execSql(trimRequest);
          });
          insertRequest.addParameter('playerName', TYPES.NVarChar, playerName);
          insertRequest.addParameter('score', TYPES.Int, scoreNum);
          insertRequest.addParameter('operationType', TYPES.NVarChar, operationType);
          connection.execSql(insertRequest);
        }
      });
      request.addParameter('playerName', TYPES.NVarChar, playerName);
      request.addParameter('operationType', TYPES.NVarChar, operationType);
      connection.execSql(request);
    });
  });

  connection.connect();
}
