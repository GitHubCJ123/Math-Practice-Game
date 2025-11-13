import sql from 'mssql';
import { getPool } from '../lib/db-pool.js';
import { getPusherInstance } from '../lib/pusher-utils.js';
import { generateQuestions } from '../lib/question-generator.js';
import type { Operation } from '../types';

export default async function handler(req: any, res: any) {
  // Get action from query or body
  const action = req.query.action || req.body.action;

  if (!action) {
    return res.status(400).json({ message: 'action parameter is required' });
  }

  console.log(`[api/rematch] Function invoked with action: ${action}`);

  // Route to appropriate handler based on action
  switch (action) {
    case 'request':
      return handleRequest(req, res);
    case 'accept':
      return handleAccept(req, res);
    case 'decline':
      return handleDecline(req, res);
    case 'status':
      return handleStatus(req, res);
    default:
      return res.status(400).json({ message: `Unknown action: ${action}` });
  }
}

async function handleRequest(req: any, res: any) {
  console.log('[api/rematch] handleRequest called');
  console.log('[api/rematch] Method:', req.method);
  console.log('[api/rematch] Body:', JSON.stringify(req.body, null, 2));
  
  if (req.method !== 'POST') {
    console.log('[api/rematch] Wrong method, returning 405');
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { gameId, sessionId, roomCode } = req.body;
  console.log('[api/rematch] Extracted values:', { gameId, sessionId, roomCode });

  if (!gameId || isNaN(gameId)) {
    console.log('[api/rematch] Invalid gameId:', gameId);
    return res.status(400).json({ message: 'Valid gameId is required' });
  }

  if (!sessionId || typeof sessionId !== 'string') {
    console.log('[api/rematch] Invalid sessionId:', sessionId);
    return res.status(400).json({ message: 'sessionId is required' });
  }

  if (!roomCode || typeof roomCode !== 'string') {
    console.log('[api/rematch] Invalid roomCode:', roomCode);
    return res.status(400).json({ message: 'roomCode is required' });
  }

  let transaction: sql.Transaction | null = null;
  try {
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

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
      return res.status(404).json({ message: 'Opponent has already left the match' });
    }

    const updateGameRequest = new sql.Request(transaction);
    updateGameRequest.input('gameId', sql.Int, gameId);
    updateGameRequest.input('rematchStatus', sql.NVarChar, 'rematch_requested');
    await updateGameRequest.query(`
      UPDATE Games
      SET Status = @rematchStatus, UpdatedAt = GETUTCDATE()
      WHERE Id = @gameId
    `);

    await transaction.commit();
    console.log('[api/rematch] Transaction committed successfully');

    const pusher = getPusherInstance();
    const channelName = `private-game-${game.RoomCode}`;
    const eventData = {
      requestingSessionId: sessionId,
      gameId: game.Id,
      roomCode: game.RoomCode,
      timestamp: Date.now(),
    };
    
    console.log('[api/rematch] Triggering Pusher rematch-request event');
    console.log('[api/rematch] Channel:', channelName);
    console.log('[api/rematch] Event data:', JSON.stringify(eventData, null, 2));
    
    try {
      await pusher.trigger(channelName, 'rematch-request', eventData);
      console.log('[api/rematch] Pusher event triggered successfully');
    } catch (pusherError: any) {
      console.error('[api/rematch] Error triggering Pusher event:', pusherError);
      // Still return success - the event might be received via polling
    }

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
          if (currentStatus === 'rematch_requested') {
            const updateRequest = timeoutPool.request();
            updateRequest.input('gameId', sql.Int, gameId);
            await updateRequest.query(`
              UPDATE Games SET Status = 'completed', UpdatedAt = GETUTCDATE() WHERE Id = @gameId
            `);
            
            const timeoutPusher = getPusherInstance();
            await timeoutPusher.trigger(`private-game-${game.RoomCode}`, 'rematch-declined', {
              gameId: game.Id,
              reason: 'timeout',
            });
          }
        }
      } catch (error) {
        console.error('[api/rematch] Error in timeout handler:', error);
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
        console.error('[api/rematch] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/rematch] Error:', error);
    return res.status(500).json({ message: 'Failed to send rematch request', error: error.message });
  }
}

async function handleAccept(req: any, res: any) {
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
    
    if (game.Status !== 'rematch_requested') {
      await transaction.rollback();
      return res.status(400).json({ message: 'No pending rematch request' });
    }

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

    const previousQuestions = game.Questions ? JSON.parse(game.Questions) : [];
    const operation: Operation = previousQuestions[0]?.operation || 'multiplication';
    const selectedNumbers = previousQuestions.length > 0 
      ? Array.from({ length: 12 }, (_, i) => i + 1)
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    
    const newQuestions = generateQuestions(operation, selectedNumbers);
    const startTime = Date.now() + 12000;
    
    const resetPlayersRequest = new sql.Request(transaction);
    resetPlayersRequest.input('gameId', sql.Int, gameId);
    await resetPlayersRequest.query(`
      UPDATE GamePlayers
      SET Status = 'playing', Answers = NULL, FinalTime = NULL, UpdatedAt = GETUTCDATE()
      WHERE GameId = @gameId
    `);

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

    const pusher = getPusherInstance();
    const channelName = `private-game-${game.RoomCode}`;
    
    console.log('[api/rematch] handleAccept: Triggering Pusher events');
    console.log('[api/rematch] handleAccept: Channel:', channelName);
    
    try {
      await pusher.trigger(channelName, 'rematch-accepted', {
        acceptingSessionId: sessionId,
        requestingSessionId: requestingSessionId,
        gameId: game.Id,
        roomCode: game.RoomCode,
        questions: newQuestions,
        startTime: startTime,
      });
      console.log('[api/rematch] handleAccept: rematch-accepted event triggered');

      await pusher.trigger(channelName, 'game-start', {
        gameId: game.Id,
        questions: newQuestions,
        startTime: startTime,
      });
      console.log('[api/rematch] handleAccept: game-start event triggered');
    } catch (pusherError: any) {
      console.error('[api/rematch] handleAccept: Error triggering Pusher events:', pusherError);
      // Still return success - clients can navigate using API response
    }

    return res.status(200).json({ 
      success: true,
      gameId: game.Id,
      roomCode: game.RoomCode,
      questions: newQuestions,
      startTime: startTime,
      requestingSessionId: requestingSessionId,
    });
  } catch (error: any) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/rematch] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/rematch] Error:', error);
    return res.status(500).json({ message: 'Failed to accept rematch', error: error.message });
  }
}

async function handleDecline(req: any, res: any) {
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
    
    const updateGameRequest = new sql.Request(transaction);
    updateGameRequest.input('gameId', sql.Int, gameId);
    await updateGameRequest.query(`
      UPDATE Games
      SET Status = 'completed', UpdatedAt = GETUTCDATE()
      WHERE Id = @gameId
    `);

    await transaction.commit();

    const pusher = getPusherInstance();
    await pusher.trigger(`private-game-${game.RoomCode}`, 'rematch-declined', {
      decliningSessionId: sessionId,
      gameId: game.Id,
      reason: 'declined',
    });

    return res.status(200).json({ 
      success: true,
      message: 'Rematch declined',
    });
  } catch (error: any) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/rematch] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/rematch] Error:', error);
    return res.status(500).json({ message: 'Failed to decline rematch', error: error.message });
  }
}

async function handleStatus(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { gameId, sessionId } = req.query;

  if (!gameId || isNaN(parseInt(gameId, 10))) {
    return res.status(400).json({ message: 'Valid gameId is required' });
  }

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  try {
    const pool = await getPool();
    const gameRequest = pool.request();
    gameRequest.input('gameId', sql.Int, parseInt(gameId, 10));
    
    const gameResult = await gameRequest.query(`
      SELECT Status
      FROM Games
      WHERE Id = @gameId
    `);

    if (gameResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Game not found' });
    }

    const status = gameResult.recordset[0].Status;
    
    if (status === 'rematch_requested') {
      const playersRequest = pool.request();
      playersRequest.input('gameId', sql.Int, parseInt(gameId, 10));
      const playersResult = await playersRequest.query(`
        SELECT PlayerSessionId, Status, UpdatedAt
        FROM GamePlayers
        WHERE GameId = @gameId
        ORDER BY UpdatedAt DESC
      `);
      
      // Find who requested the rematch (the one who didn't request it is the one checking)
      const requestingPlayer = playersResult.recordset.find((p: any) => p.PlayerSessionId !== sessionId);
      
      return res.status(200).json({
        status: 'waiting',
        requestingSessionId: requestingPlayer?.PlayerSessionId || null,
      });
    } else if (status === 'rematch_accepted') {
      return res.status(200).json({
        status: 'accepted',
      });
    } else {
      return res.status(200).json({
        status: 'none',
      });
    }
  } catch (error: any) {
    console.error('[api/rematch] Error:', error);
    return res.status(500).json({ message: 'Failed to get rematch status', error: error.message });
  }
}

