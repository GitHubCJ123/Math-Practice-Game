import sql from 'mssql';
import { getPool } from '../db-pool.js';
import { getPusherInstance } from '../pusher-utils.js';
import { generateQuestions } from '../question-generator.js';
import type { Operation } from '../../types';

export default async function handler(req: any, res: any) {
  console.log('[api/games/play-again] Function invoked.');
  console.log('[api/games/play-again] Request body:', req.body);
  
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

    // Get player info with Id field
    const getPlayerRequest = new sql.Request(transaction);
    getPlayerRequest.input('gameId', sql.Int, gameId);
    getPlayerRequest.input('sessionId', sql.NVarChar, sessionId);
    const playerResult = await getPlayerRequest.query(`
      SELECT Id, PlayerSessionId, Status
      FROM GamePlayers
      WHERE GameId = @gameId AND PlayerSessionId = @sessionId
    `);

    if (playerResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Player not found in game' });
    }

    const player = playerResult.recordset[0];
    console.log('[api/games/play-again] Found player:', player.Id, player.PlayerSessionId.substring(0, 20) + '...');
    
    // Use Status field to track play-again: 'finished' = submitted, 'play_again' = clicked play again
    // Update player status to 'play_again'
    const updatePlayerRequest = new sql.Request(transaction);
    updatePlayerRequest.input('playerId', sql.Int, player.Id);
    await updatePlayerRequest.query(`
      UPDATE GamePlayers
      SET Status = 'play_again', UpdatedAt = GETUTCDATE()
      WHERE Id = @playerId
    `);
    console.log('[api/games/play-again] Updated player', player.Id, 'status to play_again');

    // Count how many players have status 'play_again'
    const checkPlayAgainRequest = new sql.Request(transaction);
    checkPlayAgainRequest.input('gameId', sql.Int, gameId);
    const playAgainResult = await checkPlayAgainRequest.query(`
      SELECT COUNT(*) as count
      FROM GamePlayers
      WHERE GameId = @gameId AND Status = 'play_again'
    `);

    const playAgainCount = playAgainResult.recordset[0].count;
    console.log('[api/games/play-again] Total play again count:', playAgainCount, 'out of 2 players');

    // If both players are ready, reset the game
    if (playAgainCount >= 2) {
      // Get game settings from previous game (stored when second player joined)
      // We need to get the operation and selectedNumbers
      // For now, we'll use defaults - in a real app, you'd store these in the game record
      const operation: Operation = 'multiplication';
      const selectedNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

      // Reset all players' status and answers
      const resetPlayersRequest = new sql.Request(transaction);
      resetPlayersRequest.input('gameId', sql.Int, gameId);
      await resetPlayersRequest.query(`
        UPDATE GamePlayers
        SET Status = 'playing', Answers = NULL, FinalTime = NULL, UpdatedAt = GETUTCDATE()
        WHERE GameId = @gameId
      `);

      // Reset game status to waiting
      const resetGameRequest = new sql.Request(transaction);
      resetGameRequest.input('gameId', sql.Int, gameId);
      resetGameRequest.input('gameSettings', sql.NVarChar, JSON.stringify({ operation, selectedNumbers }));
      await resetGameRequest.query(`
        UPDATE Games
        SET Status = 'waiting', Questions = @gameSettings, UpdatedAt = GETUTCDATE()
        WHERE Id = @gameId
      `);

      await transaction.commit();

      // Notify both players that game is reset
      const pusher = getPusherInstance();
      console.log('[api/games/play-again] Triggering game-reset event for room:', game.RoomCode);
      await pusher.trigger(`private-game-${game.RoomCode}`, 'game-reset', {
        gameId: game.Id,
      });

      return res.status(200).json({ 
        success: true,
        count: playAgainCount,
        gameReset: true,
      });
    } else {
      await transaction.commit();

      // Notify both players of the updated count
      const pusher = getPusherInstance();
      console.log('[api/games/play-again] Triggering play-again-update event, count:', playAgainCount);
      await pusher.trigger(`private-game-${game.RoomCode}`, 'play-again-update', {
        count: playAgainCount,
      });

      return res.status(200).json({ 
        success: true,
        count: playAgainCount,
        gameReset: false,
      });
    }
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/games/play-again] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games/play-again] Error:', error);
    return res.status(500).json({ message: 'Failed to process play again', error: error.message });
  }
}

