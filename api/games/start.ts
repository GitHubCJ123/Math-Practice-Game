import sql from 'mssql';
import { getPool } from '../db-pool.js';
import { getPusherInstance } from '../pusher-utils.js';
import { generateQuestions } from '../question-generator.js';
import type { Operation } from '../../types';

export default async function handler(req: any, res: any) {
  console.log('[api/games/start] Function invoked.');
  console.log('[api/games/start] Request body:', req.body);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { gameId, sessionId } = req.body;

  if (!gameId || isNaN(gameId)) {
    return res.status(400).json({ message: 'Valid gameId is required' });
  }

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  let transaction: sql.Transaction | null = null;
  try {
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Get game and verify it's waiting
    const getGameRequest = new sql.Request(transaction);
    getGameRequest.input('gameId', sql.Int, gameId);
    const gameResult = await getGameRequest.query(`
      SELECT Id, RoomCode, Status, Questions
      FROM Games
      WHERE Id = @gameId
    `);

    if (gameResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Game not found' });
    }

    const game = gameResult.recordset[0];

    if (game.Status !== 'waiting') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Game is not waiting to start' });
    }

    // Verify the player is the host (first player)
    const getPlayersRequest = new sql.Request(transaction);
    getPlayersRequest.input('gameId', sql.Int, gameId);
    const playersResult = await getPlayersRequest.query(`
      SELECT PlayerSessionId, Id
      FROM GamePlayers
      WHERE GameId = @gameId
      ORDER BY Id ASC
    `);

    if (playersResult.recordset.length < 2) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Not enough players to start game' });
    }

    // First player is the host
    const hostSessionId = playersResult.recordset[0].PlayerSessionId;
    if (hostSessionId !== sessionId) {
      await transaction.rollback();
      return res.status(403).json({ message: 'Only the host can start the game' });
    }

    // Get game settings from Questions field (stored when second player joined)
    const gameSettings = JSON.parse(game.Questions || '{}');
    const operation = gameSettings.operation as Operation;
    const selectedNumbers = gameSettings.selectedNumbers as number[];

    if (!operation || !selectedNumbers) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Game settings not found' });
    }

    // Generate questions
    const questions = generateQuestions(operation, selectedNumbers);
    const questionsJson = JSON.stringify(questions);

    // Calculate start time (12 seconds from now to account for network latency)
    const startTime = Date.now() + 12000;

    // Update game status to in_progress
    const updateGameRequest = new sql.Request(transaction);
    updateGameRequest.input('gameId', sql.Int, gameId);
    updateGameRequest.input('questions', sql.NVarChar, questionsJson);
    updateGameRequest.input('startTime', sql.BigInt, startTime);
    await updateGameRequest.query(`
      UPDATE Games
      SET Status = 'in_progress', Questions = @questions, StartTime = @startTime, UpdatedAt = GETUTCDATE()
      WHERE Id = @gameId
    `);

    await transaction.commit();

    // Trigger Pusher event to start the game for both players
    const pusher = getPusherInstance();
    await pusher.trigger(`private-game-${game.RoomCode}`, 'game-start', {
      questions,
      gameId: game.Id,
      startTime,
    });

    return res.status(200).json({ 
      success: true,
      questions,
      gameId: game.Id,
      startTime,
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/games/start] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games/start] Error:', error);
    return res.status(500).json({ message: 'Failed to start game', error: error.message });
  }
}


