import sql from 'mssql';
import { getPool } from '../db-pool.js';
import { getPusherInstance } from '../pusher-utils.js';

export default async function handler(req: any, res: any) {
  console.log('[api/games/rematch-request] Function invoked.');
  console.log('[api/games/rematch-request] Request body:', req.body);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { gameId, sessionId, roomCode } = req.body;

  if (!gameId || isNaN(gameId)) {
    return res.status(400).json({ message: 'Valid gameId is required' });
  }

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  if (!roomCode || typeof roomCode !== 'string') {
    return res.status(400).json({ message: 'roomCode is required' });
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
      SELECT Id, RoomCode, Status
      FROM Games
      WHERE Id = @gameId
    `);

    if (gameResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Game not found' });
    }

    const game = gameResult.recordset[0];

    // Verify player is in the game
    const getPlayerRequest = new sql.Request(transaction);
    getPlayerRequest.input('gameId', sql.Int, gameId);
    getPlayerRequest.input('sessionId', sql.NVarChar, sessionId);
    const playerResult = await getPlayerRequest.query(`
      SELECT Id, PlayerSessionId
      FROM GamePlayers
      WHERE GameId = @gameId AND PlayerSessionId = @sessionId
    `);

    if (playerResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Player not found in game' });
    }

    // Get opponent session ID
    const getOpponentRequest = new sql.Request(transaction);
    getOpponentRequest.input('gameId', sql.Int, gameId);
    getOpponentRequest.input('sessionId', sql.NVarChar, sessionId);
    const opponentResult = await getOpponentRequest.query(`
      SELECT PlayerSessionId
      FROM GamePlayers
      WHERE GameId = @gameId AND PlayerSessionId != @sessionId
    `);

    if (opponentResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Opponent not found' });
    }

    const opponentSessionId = opponentResult.recordset[0].PlayerSessionId;

    // Store rematch request in Games table Status field temporarily
    // Use a shorter format to fit in NVARCHAR(20) - just store 'rematch_requested' and use UpdatedAt for timestamp
    // We'll identify the requester via Pusher event data instead of storing in Status
    const updateGameRequest = new sql.Request(transaction);
    updateGameRequest.input('gameId', sql.Int, gameId);
    updateGameRequest.input('rematchStatus', sql.NVarChar, 'rematch_requested');
    await updateGameRequest.query(`
      UPDATE Games
      SET Status = @rematchStatus, UpdatedAt = GETUTCDATE()
      WHERE Id = @gameId
    `);

    await transaction.commit();

    // Send Pusher notification to opponent
    const pusher = getPusherInstance();
    console.log('[api/games/rematch-request] Triggering rematch-request event to room:', game.RoomCode);
    await pusher.trigger(`private-game-${game.RoomCode}`, 'rematch-request', {
      requestingSessionId: sessionId,
      gameId: game.Id,
      roomCode: game.RoomCode,
      timestamp: Date.now(),
    });

    // Set up timeout to auto-decline after 30 seconds
    setTimeout(async () => {
      try {
        const timeoutPool = await getPool();
        const checkRequest = timeoutPool.request();
        checkRequest.input('gameId', sql.Int, gameId);
        const checkResult = await checkRequest.query(`
          SELECT Status FROM Games WHERE Id = @gameId
        `);
        
        if (checkResult.recordset.length > 0) {
          const currentStatus = checkResult.recordset[0].Status;
          // Check if rematch is still pending (not accepted)
          if (currentStatus === 'rematch_requested') {
            // Timeout - decline rematch
            const updateRequest = timeoutPool.request();
            updateRequest.input('gameId', sql.Int, gameId);
            await updateRequest.query(`
              UPDATE Games SET Status = 'completed', UpdatedAt = GETUTCDATE() WHERE Id = @gameId
            `);
            
            // Notify both players
            const timeoutPusher = getPusherInstance();
            await timeoutPusher.trigger(`private-game-${game.RoomCode}`, 'rematch-declined', {
              gameId: game.Id,
              reason: 'timeout',
            });
          }
        }
      } catch (error) {
        console.error('[api/games/rematch-request] Error in timeout handler:', error);
      }
    }, 30000);

    return res.status(200).json({ 
      success: true,
      message: 'Rematch request sent',
    });
  } catch (error: any) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/games/rematch-request] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games/rematch-request] Error:', error);
    return res.status(500).json({ message: 'Failed to send rematch request', error: error.message });
  }
}

