import sql from 'mssql';
import { getPool } from '../db-pool.js';
import { getPusherInstance } from '../pusher-utils.js';
import { generateQuestions } from '../question-generator.js';
import type { Operation } from '../../types';

export default async function handler(req: any, res: any) {
  console.log('[api/games/rematch-accept] Function invoked.');
  console.log('[api/games/rematch-accept] Request body:', req.body);
  
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

    // Get game info
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
    
    // Check if there's a pending rematch request
    if (game.Status !== 'rematch_requested') {
      await transaction.rollback();
      return res.status(400).json({ message: 'No pending rematch request' });
    }

    // Get the requesting session ID from GamePlayers - find the other player
    const getPlayersRequest = new sql.Request(transaction);
    getPlayersRequest.input('gameId', sql.Int, gameId);
    getPlayersRequest.input('sessionId', sql.NVarChar, sessionId);
    const playersResult = await getPlayersRequest.query(`
      SELECT PlayerSessionId
      FROM GamePlayers
      WHERE GameId = @gameId AND PlayerSessionId != @sessionId
    `);
    
    if (playersResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Opponent not found' });
    }
    
    const requestingSessionId = playersResult.recordset[0].PlayerSessionId;

    // Get previous game questions to generate different ones
    const previousQuestions = game.Questions ? JSON.parse(game.Questions) : [];
    const operation: Operation = previousQuestions[0]?.operation || 'multiplication';
    const selectedNumbers = previousQuestions.length > 0 
      ? Array.from({ length: 12 }, (_, i) => i + 1) // Default numbers
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    
    // Generate NEW questions (different from previous match)
    const newQuestions = generateQuestions(operation, selectedNumbers);
    
    // Calculate start time (12 seconds from now)
    const startTime = Date.now() + 12000;
    
    // Reset game for rematch
    const resetPlayersRequest = new sql.Request(transaction);
    resetPlayersRequest.input('gameId', sql.Int, gameId);
    await resetPlayersRequest.query(`
      UPDATE GamePlayers
      SET Status = 'playing', Answers = NULL, FinalTime = NULL, UpdatedAt = GETUTCDATE()
      WHERE GameId = @gameId
    `);

    // Update game with new questions and status - set to 'waiting' so matchmaking screen can handle it
    // Store the startTime to ensure synchronization
    const resetGameRequest = new sql.Request(transaction);
    resetGameRequest.input('gameId', sql.Int, gameId);
    resetGameRequest.input('newQuestions', sql.NVarChar, JSON.stringify(newQuestions));
    resetGameRequest.input('rematchStatus', sql.NVarChar, 'waiting');
    resetGameRequest.input('startTime', sql.BigInt, startTime);
    await resetGameRequest.query(`
      UPDATE Games
      SET Status = @rematchStatus, Questions = @newQuestions, StartTime = @startTime, UpdatedAt = GETUTCDATE()
      WHERE Id = @gameId
    `);

    await transaction.commit();

    // Notify both players that rematch was accepted
    const pusher = getPusherInstance();
    console.log('[api/games/rematch-accept] Triggering rematch-accepted event to room:', game.RoomCode);
    
    await pusher.trigger(`private-game-${game.RoomCode}`, 'rematch-accepted', {
      acceptingSessionId: sessionId,
      requestingSessionId: requestingSessionId,
      gameId: game.Id,
      roomCode: game.RoomCode,
      questions: newQuestions,
      startTime: startTime,
    });

    // Also trigger a game-start event to ensure both players get the signal
    await pusher.trigger(`private-game-${game.RoomCode}`, 'game-start', {
      gameId: game.Id,
      questions: newQuestions,
      startTime: startTime,
    });

    return res.status(200).json({ 
      success: true,
      gameId: game.Id,
      roomCode: game.RoomCode,
      questions: newQuestions,
      startTime: startTime,
      requestingSessionId: requestingSessionId, // Include this so the accepter knows who requested
    });
  } catch (error: any) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/games/rematch-accept] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games/rematch-accept] Error:', error);
    return res.status(500).json({ message: 'Failed to accept rematch', error: error.message });
  }
}

