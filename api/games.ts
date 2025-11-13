import sql from 'mssql';
import { getPool } from '../lib/db-pool.js';
import { generateRoomCode, generateSessionId, getPusherInstance } from '../lib/pusher-utils.js';
import { generateQuestions } from '../lib/question-generator.js';
import { ensureDailyIdReset } from '../lib/daily-id-reset.js';
import type { Operation } from '../types';

console.log('[api/games] Module loaded successfully');
console.log('[api/games] getPool:', typeof getPool);
console.log('[api/games] generateRoomCode:', typeof generateRoomCode);
console.log('[api/games] generateSessionId:', typeof generateSessionId);
console.log('[api/games] getPusherInstance:', typeof getPusherInstance);
console.log('[api/games] generateQuestions:', typeof generateQuestions);
console.log('[api/games] ensureDailyIdReset:', typeof ensureDailyIdReset);

export default async function handler(req: any, res: any) {
  console.log('[api/games] ===== HANDLER CALLED =====');
  console.log('[api/games] Method:', req.method);
  console.log('[api/games] URL:', req.url);
  console.log('[api/games] Query:', JSON.stringify(req.query));
  console.log('[api/games] Body:', JSON.stringify(req.body));
  
  // Get action from query or body
  const action = req.query.action || req.body.action;
  console.log('[api/games] Extracted action:', action);

  if (!action) {
    console.log('[api/games] No action provided, returning 400');
    return res.status(400).json({ message: 'action parameter is required' });
  }

  console.log(`[api/games] Function invoked with action: ${action}`);
  
  try {
    // Route to appropriate handler based on action
    switch (action) {
      case 'create':
        console.log('[api/games] Routing to handleCreate');
        return handleCreate(req, res);
      case 'join':
        console.log('[api/games] Routing to handleJoin');
        return handleJoin(req, res);
      case 'random':
        console.log('[api/games] Routing to handleRandom');
        return handleRandom(req, res);
      case 'status':
        console.log('[api/games] Routing to handleStatus');
        return handleStatus(req, res);
      case 'info':
        console.log('[api/games] Routing to handleGetGameInfo');
        return handleGetGameInfo(req, res);
      case 'players':
        console.log('[api/games] Routing to handlePlayers');
        return handlePlayers(req, res);
      case 'start':
        console.log('[api/games] Routing to handleStart');
        return handleStart(req, res);
      case 'submit':
        console.log('[api/games] Routing to handleSubmit');
        return handleSubmit(req, res);
      case 'play-again':
        console.log('[api/games] Routing to handlePlayAgain');
        return handlePlayAgain(req, res);
      case 'play-again-status':
        console.log('[api/games] Routing to handlePlayAgainStatus');
        return handlePlayAgainStatus(req, res);
      default:
        console.log('[api/games] Unknown action:', action);
        return res.status(400).json({ message: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('[api/games] ===== UNHANDLED ERROR =====');
    console.error('[api/games] Error message:', error.message);
    console.error('[api/games] Error name:', error.name);
    console.error('[api/games] Error stack:', error.stack);
    console.error('[api/games] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return res.status(500).json({ 
      message: 'Internal server error', 
      error: error.message,
      name: error.name,
      stack: error.stack
    });
  }
}

async function handleCreate(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  let transaction: sql.Transaction | null = null;
  try {
    const pool = await getPool();
    
    await ensureDailyIdReset();
    
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    let roomCode = generateRoomCode();
    let attempts = 0;
    let roomCodeExists = true;

    while (roomCodeExists && attempts < 10) {
      const checkRequest = new sql.Request(transaction);
      checkRequest.input('roomCode', sql.NVarChar, roomCode);
      const result = await checkRequest.query(`
        SELECT COUNT(*) as count FROM Games WHERE RoomCode = @roomCode
      `);
      
      if (result.recordset[0].count === 0) {
        roomCodeExists = false;
      } else {
        roomCode = generateRoomCode();
        attempts++;
      }
    }

    if (roomCodeExists) {
      await transaction.rollback();
      return res.status(500).json({ message: 'Failed to generate unique room code' });
    }

    const createGameRequest = new sql.Request(transaction);
    createGameRequest.input('roomCode', sql.NVarChar, roomCode);
    const gameResult = await createGameRequest.query(`
      INSERT INTO Games (RoomCode, Status)
      OUTPUT INSERTED.Id
      VALUES (@roomCode, 'waiting');
    `);

    const gameId = gameResult.recordset[0].Id;
    const sessionId = generateSessionId();
    const createPlayerRequest = new sql.Request(transaction);
    createPlayerRequest.input('gameId', sql.Int, gameId);
    createPlayerRequest.input('sessionId', sql.NVarChar, sessionId);
    await createPlayerRequest.query(`
      INSERT INTO GamePlayers (GameId, PlayerSessionId, Status)
      VALUES (@gameId, @sessionId, 'playing');
    `);

    await transaction.commit();
    res.setHeader('Set-Cookie', `gameSession=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);

    return res.status(201).json({ 
      gameId, 
      roomCode,
      sessionId 
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/games] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games] Error:', error);
    return res.status(500).json({ message: 'Failed to create game', error: error.message });
  }
}

async function handleJoin(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { roomCode, operation, selectedNumbers } = req.body;

  if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
    return res.status(400).json({ message: 'Valid roomCode is required' });
  }

  if (!operation || !selectedNumbers || !Array.isArray(selectedNumbers)) {
    return res.status(400).json({ message: 'operation and selectedNumbers are required' });
  }

  let transaction: sql.Transaction | null = null;
  try {
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const findGameRequest = new sql.Request(transaction);
    findGameRequest.input('roomCode', sql.NVarChar, roomCode.toUpperCase());
    const gameResult = await findGameRequest.query(`
      SELECT Id, Status, Questions
      FROM Games
      WHERE UPPER(RoomCode) = UPPER(@roomCode)
    `);

    if (gameResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: `Game with code "${roomCode.toUpperCase()}" not found. Make sure the code is correct and the game hasn't expired.` });
    }

    const game = gameResult.recordset[0];

    if (game.Status !== 'waiting') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Game is not waiting for players' });
    }

    const countPlayersRequest = new sql.Request(transaction);
    countPlayersRequest.input('gameId', sql.Int, game.Id);
    const playerCountResult = await countPlayersRequest.query(`
      SELECT COUNT(*) as count
      FROM GamePlayers
      WHERE GameId = @gameId
    `);

    const playerCount = playerCountResult.recordset[0].count;
    if (playerCount >= 2) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Game is full' });
    }

    const sessionId = generateSessionId();
    const addPlayerRequest = new sql.Request(transaction);
    addPlayerRequest.input('gameId', sql.Int, game.Id);
    addPlayerRequest.input('sessionId', sql.NVarChar, sessionId);
    await addPlayerRequest.query(`
      INSERT INTO GamePlayers (GameId, PlayerSessionId, Status)
      VALUES (@gameId, @sessionId, 'playing');
    `);

    const gameSettingsJson = JSON.stringify({ operation, selectedNumbers });
    const updateGameRequest = new sql.Request(transaction);
    updateGameRequest.input('gameId', sql.Int, game.Id);
    updateGameRequest.input('gameSettings', sql.NVarChar, gameSettingsJson);
    await updateGameRequest.query(`
      UPDATE Games
      SET Questions = @gameSettings, UpdatedAt = GETUTCDATE()
      WHERE Id = @gameId
    `);

    await transaction.commit();

    const pusher = getPusherInstance();
    await pusher.trigger(`private-game-${roomCode.toUpperCase()}`, 'opponent-joined', {
      gameId: game.Id,
    });

    res.setHeader('Set-Cookie', `gameSession=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);

    return res.status(200).json({ 
      success: true, 
      gameId: game.Id,
      sessionId,
      roomCode: roomCode.toUpperCase(),
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/games] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games] Error:', error);
    return res.status(500).json({ message: 'Failed to join game', error: error.message });
  }
}

async function handleRandom(req: any, res: any) {
  console.log('[api/games] ===== handleRandom STARTED =====');
  console.log('[api/games] handleRandom - Method:', req.method);
  
  if (req.method !== 'GET') {
    console.log('[api/games] handleRandom - Wrong method, returning 405');
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { operation, selectedNumbers, sessionId } = req.query;
  console.log('[api/games] handleRandom - operation:', operation);
  console.log('[api/games] handleRandom - selectedNumbers:', selectedNumbers);
  console.log('[api/games] handleRandom - sessionId:', sessionId);

  if (!operation || !selectedNumbers) {
    console.log('[api/games] handleRandom - Missing required params');
    return res.status(400).json({ message: 'operation and selectedNumbers are required' });
  }

  let selectedNumbersArray: number[];
  try {
    console.log('[api/games] handleRandom - Parsing selectedNumbers JSON...');
    selectedNumbersArray = JSON.parse(selectedNumbers);
    console.log('[api/games] handleRandom - Parsed array:', selectedNumbersArray);
  } catch (e: any) {
    console.error('[api/games] handleRandom - JSON parse error:', e.message);
    return res.status(400).json({ message: 'selectedNumbers must be a valid JSON array' });
  }

  console.log('[api/games] handleRandom - Generating session ID...');
  const playerSessionId = sessionId || generateSessionId();
  const pusherChannel = `private-matchmaking-${playerSessionId}`;
  console.log('[api/games] handleRandom - playerSessionId:', playerSessionId);
  console.log('[api/games] handleRandom - pusherChannel:', pusherChannel);

  let transaction: sql.Transaction | null = null;
  try {
    console.log('[api/games] handleRandom: Step 1 - Getting pool...');
    const pool = await getPool();
    console.log('[api/games] handleRandom: Step 2 - Pool obtained:', !!pool);
    
    console.log('[api/games] handleRandom: Step 3 - Ensuring daily reset...');
    await ensureDailyIdReset();
    console.log('[api/games] handleRandom: Step 4 - Daily reset complete');
    
    console.log('[api/games] handleRandom: Step 5 - Starting transaction...');
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    console.log('[api/games] handleRandom: Step 6 - Transaction started');

    console.log('[api/games] handleRandom: Step 7 - Searching for match...');
    const findMatchRequest = new sql.Request(transaction);
    findMatchRequest.input('playerSessionId', sql.NVarChar, playerSessionId);
    const matchResult = await findMatchRequest.query(`
      SELECT TOP 1 Id, PlayerSessionId, Operation, SelectedNumbers, PusherChannel
      FROM MatchmakingQueue
      WHERE PlayerSessionId != @playerSessionId
      ORDER BY CreatedAt ASC
    `);
    console.log('[api/games] handleRandom: Step 8 - Match search complete, found:', matchResult.recordset.length);

    if (matchResult.recordset.length > 0) {
      console.log('[api/games] handleRandom: Match found! Processing...');
      const matchedPlayer = matchResult.recordset[0];
      
      console.log('[api/games] handleRandom: Removing players from queue...');
      const removeQueueRequest = new sql.Request(transaction);
      removeQueueRequest.input('sessionId1', sql.NVarChar, playerSessionId);
      removeQueueRequest.input('sessionId2', sql.NVarChar, matchedPlayer.PlayerSessionId);
      await removeQueueRequest.query(`
        DELETE FROM MatchmakingQueue
        WHERE PlayerSessionId IN (@sessionId1, @sessionId2)
      `);
      console.log('[api/games] handleRandom: Players removed from queue');

      console.log('[api/games] handleRandom: Generating room code...');
      let roomCode = generateRoomCode();
      let attempts = 0;
      let roomCodeExists = true;

      while (roomCodeExists && attempts < 10) {
        const checkRequest = new sql.Request(transaction);
        checkRequest.input('roomCode', sql.NVarChar, roomCode);
        const result = await checkRequest.query(`
          SELECT COUNT(*) as count FROM Games WHERE RoomCode = @roomCode
        `);
        
        if (result.recordset[0].count === 0) {
          roomCodeExists = false;
        } else {
          roomCode = generateRoomCode();
          attempts++;
        }
      }
      console.log('[api/games] handleRandom: Room code generated:', roomCode);

      if (roomCodeExists) {
        console.error('[api/games] handleRandom: Failed to generate unique room code after 10 attempts');
        await transaction.rollback();
        return res.status(500).json({ message: 'Failed to generate unique room code' });
      }

      console.log('[api/games] handleRandom: Creating game...');
      const createGameRequest = new sql.Request(transaction);
      createGameRequest.input('roomCode', sql.NVarChar, roomCode);
      const gameResult = await createGameRequest.query(`
        INSERT INTO Games (RoomCode, Status)
        OUTPUT INSERTED.Id
        VALUES (@roomCode, 'waiting');
      `);

      const gameId = gameResult.recordset[0].Id;
      console.log('[api/games] handleRandom: Game created with ID:', gameId);

      console.log('[api/games] handleRandom: Adding players to game...');
      const addPlayer1Request = new sql.Request(transaction);
      addPlayer1Request.input('gameId', sql.Int, gameId);
      addPlayer1Request.input('sessionId', sql.NVarChar, playerSessionId);
      await addPlayer1Request.query(`
        INSERT INTO GamePlayers (GameId, PlayerSessionId, Status)
        VALUES (@gameId, @sessionId, 'playing');
      `);
      console.log('[api/games] handleRandom: Player 1 added');

      const addPlayer2Request = new sql.Request(transaction);
      addPlayer2Request.input('gameId', sql.Int, gameId);
      addPlayer2Request.input('sessionId', sql.NVarChar, matchedPlayer.PlayerSessionId);
      await addPlayer2Request.query(`
        INSERT INTO GamePlayers (GameId, PlayerSessionId, Status)
        VALUES (@gameId, @sessionId, 'playing');
      `);
      console.log('[api/games] handleRandom: Player 2 added');

      console.log('[api/games] handleRandom: Generating questions...');
      const questions = generateQuestions(operation as Operation, selectedNumbersArray);
      const questionsJson = JSON.stringify(questions);
      const startTime = Date.now() + 12000;
      console.log('[api/games] handleRandom: Questions generated, count:', questions.length);

      console.log('[api/games] handleRandom: Updating game with questions...');
      const updateGameRequest = new sql.Request(transaction);
      updateGameRequest.input('gameId', sql.Int, gameId);
      updateGameRequest.input('questions', sql.NVarChar, questionsJson);
      updateGameRequest.input('startTime', sql.BigInt, startTime);
      await updateGameRequest.query(`
        UPDATE Games
        SET Status = 'in_progress', Questions = @questions, StartTime = @startTime, UpdatedAt = GETUTCDATE()
        WHERE Id = @gameId
      `);
      console.log('[api/games] handleRandom: Game updated');

      console.log('[api/games] handleRandom: Committing transaction...');
      await transaction.commit();
      console.log('[api/games] handleRandom: Transaction committed');

      console.log('[api/games] handleRandom: Triggering Pusher events...');
      console.log('[api/games] handleRandom: Player 2 channel:', pusherChannel);
      console.log('[api/games] handleRandom: Player 1 channel:', matchedPlayer.PusherChannel);
      console.log('[api/games] handleRandom: Player 1 sessionId:', matchedPlayer.PlayerSessionId);
      console.log('[api/games] handleRandom: Game channel:', `private-game-${roomCode}`);
      
      const pusher = getPusherInstance();
      const matchData = {
        gameId,
        roomCode,
        sessionId: playerSessionId,
        questions,
        startTime,
      };

      const player1MatchData = {
        ...matchData,
        sessionId: matchedPlayer.PlayerSessionId,
      };

      console.log('[api/games] handleRandom: Sending match-found to Player 2 channel:', pusherChannel);
      await pusher.trigger(pusherChannel, 'match-found', matchData);
      
      console.log('[api/games] handleRandom: Sending match-found to Player 1 channel:', matchedPlayer.PusherChannel);
      await pusher.trigger(matchedPlayer.PusherChannel, 'match-found', player1MatchData);
      
      console.log('[api/games] handleRandom: Sending game-start to game channel:', `private-game-${roomCode}`);
      await pusher.trigger(`private-game-${roomCode}`, 'game-start', {
        questions,
        gameId,
        startTime,
      });
      console.log('[api/games] handleRandom: All Pusher events triggered successfully');

      res.setHeader('Set-Cookie', `gameSession=${playerSessionId}; Path=/; HttpOnly; SameSite=Lax`);

      console.log('[api/games] handleRandom: Returning success response');
      return res.status(200).json({ 
        gameId, 
        roomCode,
        sessionId: playerSessionId,
        pusherChannel,
        matched: true,
        questions,
        startTime,
      });
    } else {
      console.log('[api/games] handleRandom: No match found, adding to queue...');
      const removeExistingRequest = new sql.Request(transaction);
      removeExistingRequest.input('playerSessionId', sql.NVarChar, playerSessionId);
      await removeExistingRequest.query(`
        DELETE FROM MatchmakingQueue
        WHERE PlayerSessionId = @playerSessionId
      `);
      console.log('[api/games] handleRandom: Removed existing queue entry if any');

      const addToQueueRequest = new sql.Request(transaction);
      addToQueueRequest.input('playerSessionId', sql.NVarChar, playerSessionId);
      addToQueueRequest.input('operation', sql.NVarChar, operation);
      addToQueueRequest.input('selectedNumbers', sql.NVarChar, JSON.stringify(selectedNumbersArray));
      addToQueueRequest.input('pusherChannel', sql.NVarChar, pusherChannel);
      await addToQueueRequest.query(`
        INSERT INTO MatchmakingQueue (PlayerSessionId, Operation, SelectedNumbers, PusherChannel)
        VALUES (@playerSessionId, @operation, @selectedNumbers, @pusherChannel)
      `);
      console.log('[api/games] handleRandom: Added to queue');

      console.log('[api/games] handleRandom: Committing transaction...');
      await transaction.commit();
      console.log('[api/games] handleRandom: Transaction committed');
      
      res.setHeader('Set-Cookie', `gameSession=${playerSessionId}; Path=/; HttpOnly; SameSite=Lax`);

      console.log('[api/games] handleRandom: Returning queue response');
      return res.status(200).json({ 
        sessionId: playerSessionId,
        pusherChannel,
        matched: false,
        message: 'Added to matchmaking queue'
      });
    }
  } catch (error: any) {
    console.error('[api/games] ===== handleRandom ERROR =====');
    console.error('[api/games] handleRandom - Error message:', error.message);
    console.error('[api/games] handleRandom - Error name:', error.name);
    console.error('[api/games] handleRandom - Error stack:', error.stack);
    console.error('[api/games] handleRandom - Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    if (transaction) {
      try {
        console.log('[api/games] handleRandom: Rolling back transaction...');
        await transaction.rollback();
        console.log('[api/games] handleRandom: Transaction rolled back');
      } catch (rollbackError: any) {
        console.error('[api/games] handleRandom: Failed to rollback transaction:', rollbackError.message);
        console.error('[api/games] handleRandom: Rollback error stack:', rollbackError.stack);
      }
    }
    
    return res.status(500).json({ 
      message: 'Failed to find match', 
      error: error.message,
      name: error.name,
      stack: error.stack
    });
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

  try {
    const pool = await getPool();
    const gameRequest = pool.request();
    gameRequest.input('gameId', sql.Int, parseInt(gameId, 10));
    
    const gameResult = await gameRequest.query(`
      SELECT Id, RoomCode, Status, Questions
      FROM Games
      WHERE Id = @gameId
    `);

    if (gameResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Game not found' });
    }

    const game = gameResult.recordset[0];
    const questions = game.Questions ? JSON.parse(game.Questions) : null;

    if (sessionId) {
      const playerRequest = pool.request();
      playerRequest.input('gameId', sql.Int, parseInt(gameId, 10));
      playerRequest.input('sessionId', sql.NVarChar, sessionId);
      const playerResult = await playerRequest.query(`
        SELECT PlayerSessionId, Status
        FROM GamePlayers
        WHERE GameId = @gameId AND PlayerSessionId = @sessionId
      `);

      if (playerResult.recordset.length === 0) {
        return res.status(403).json({ message: 'Player not found in game' });
      }
    }

    return res.status(200).json({
      gameId: game.Id,
      roomCode: game.RoomCode,
      status: game.Status,
      questions: questions,
      hasStarted: game.Status === 'in_progress' || game.Status === 'completed',
    });
  } catch (error) {
    console.error('[api/games] Error:', error);
    return res.status(500).json({ message: 'Failed to get game status', error: error.message });
  }
}

async function handleGetGameInfo(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { gameId, sessionId } = req.query;

  if (!gameId || !sessionId) {
    return res.status(400).json({ message: 'gameId and sessionId are required' });
  }

  try {
    const pool = await getPool();
    
    const verifyRequest = pool.request();
    verifyRequest.input('gameId', sql.Int, parseInt(gameId as string, 10));
    verifyRequest.input('sessionId', sql.NVarChar, sessionId);
    const verifyResult = await verifyRequest.query(`
      SELECT COUNT(*) as count
      FROM GamePlayers
      WHERE GameId = @gameId AND PlayerSessionId = @sessionId
    `);

    if (verifyResult.recordset[0].count === 0) {
      return res.status(403).json({ message: 'Player not in game' });
    }

    const gameRequest = pool.request();
    gameRequest.input('gameId', sql.Int, parseInt(gameId as string, 10));
    const gameResult = await gameRequest.query(`
      SELECT RoomCode, Questions, Status, CreatedAt, StartTime
      FROM Games
      WHERE Id = @gameId
    `);

    if (gameResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Game not found' });
    }

    const game = gameResult.recordset[0];
    const questions = JSON.parse(game.Questions || '[]');
    
    let startTime: number;
    if (game.StartTime !== null && game.StartTime !== undefined) {
      startTime = game.StartTime;
    } else {
      const createdAt = new Date(game.CreatedAt).getTime();
      startTime = createdAt + 13000;
      console.warn('[api/games] StartTime not stored, using fallback calculation:', startTime);
    }

    return res.status(200).json({
      roomCode: game.RoomCode,
      questions,
      startTime,
      status: game.Status,
    });
  } catch (error: any) {
    console.error('[api/games] Error:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}

async function handlePlayers(req: any, res: any) {
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
    const playersRequest = pool.request();
    playersRequest.input('gameId', sql.Int, parseInt(gameId, 10));
    
    const playersResult = await playersRequest.query(`
      SELECT PlayerSessionId, Id, FinalTime
      FROM GamePlayers
      WHERE GameId = @gameId
      ORDER BY Id ASC
    `);

    const players = playersResult.recordset;
    const playerCount = players.length;
    const isHost = playerCount > 0 && players[0].PlayerSessionId === sessionId;

    return res.status(200).json({
      playerCount,
      isHost,
      players: players.map((p: any) => ({ 
        sessionId: p.PlayerSessionId,
        finalTime: p.FinalTime,
      })),
    });
  } catch (error) {
    console.error('[api/games] Error:', error);
    return res.status(500).json({ message: 'Failed to get players', error: error.message });
  }
}

async function handleStart(req: any, res: any) {
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

    if (game.Status !== 'waiting') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Game is not waiting to start' });
    }

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

    const hostSessionId = playersResult.recordset[0].PlayerSessionId;
    if (hostSessionId !== sessionId) {
      await transaction.rollback();
      return res.status(403).json({ message: 'Only the host can start the game' });
    }

    const gameSettings = JSON.parse(game.Questions || '{}');
    const operation = gameSettings.operation as Operation;
    const selectedNumbers = gameSettings.selectedNumbers as number[];

    if (!operation || !selectedNumbers) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Game settings not found' });
    }

    const questions = generateQuestions(operation, selectedNumbers);
    const questionsJson = JSON.stringify(questions);
    const startTime = Date.now() + 12000;

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

    console.log('[api/games] handleStart: Transaction committed, triggering Pusher event');
    const pusher = getPusherInstance();
    const channelName = `private-game-${game.RoomCode}`;
    const eventData = {
      questions,
      gameId: game.Id,
      startTime,
    };
    
    console.log('[api/games] handleStart: Triggering game-start event');
    console.log('[api/games] handleStart: Channel:', channelName);
    console.log('[api/games] handleStart: Event data:', JSON.stringify(eventData, null, 2));
    
    try {
      await pusher.trigger(channelName, 'game-start', eventData);
      console.log('[api/games] handleStart: Pusher event triggered successfully');
    } catch (pusherError: any) {
      console.error('[api/games] handleStart: Error triggering Pusher event:', pusherError);
      // Still return success even if Pusher fails - client can navigate directly
    }

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
        console.error('[api/games] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games] Error:', error);
    return res.status(500).json({ message: 'Failed to start game', error: error.message });
  }
}

async function handleSubmit(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { gameId, answers, timeTaken, sessionId, cheated } = req.body;

  if (!gameId || isNaN(gameId)) {
    return res.status(400).json({ message: 'Valid gameId is required' });
  }

  if (!answers || !Array.isArray(answers) || answers.length !== 10) {
    return res.status(400).json({ message: 'answers must be an array of 10 items' });
  }

  if (typeof timeTaken !== 'number' || timeTaken < 0) {
    return res.status(400).json({ message: 'Valid timeTaken is required' });
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
      SELECT Id, RoomCode, Questions, Status
      FROM Games
      WHERE Id = @gameId
    `);

    if (gameResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Game not found' });
    }

    const game = gameResult.recordset[0];
    const questions = JSON.parse(game.Questions || '[]');

    const verifyPlayerRequest = new sql.Request(transaction);
    verifyPlayerRequest.input('gameId', sql.Int, gameId);
    verifyPlayerRequest.input('sessionId', sql.NVarChar, sessionId);
    const playerResult = await verifyPlayerRequest.query(`
      SELECT Id, Status
      FROM GamePlayers
      WHERE GameId = @gameId AND PlayerSessionId = @sessionId
    `);

    if (playerResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(403).json({ message: 'Player not found in game' });
    }

    const player = playerResult.recordset[0];

    if (player.Status === 'finished') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Player has already submitted' });
    }

    if (cheated === true) {
      console.log('[api/games] Player cheated (switched tabs), forfeiting game');
      
      const forfeitPlayerRequest = new sql.Request(transaction);
      forfeitPlayerRequest.input('playerId', sql.Int, player.Id);
      await forfeitPlayerRequest.query(`
        UPDATE GamePlayers
        SET Status = 'forfeited', FinalTime = NULL, Answers = NULL, UpdatedAt = GETUTCDATE()
        WHERE Id = @playerId
      `);

      const getOpponentRequest = new sql.Request(transaction);
      getOpponentRequest.input('gameId', sql.Int, gameId);
      getOpponentRequest.input('sessionId', sql.NVarChar, sessionId);
      const opponentResult = await getOpponentRequest.query(`
        SELECT PlayerSessionId, Status
        FROM GamePlayers
        WHERE GameId = @gameId AND PlayerSessionId != @sessionId
      `);

      const opponent = opponentResult.recordset[0];
      
      if (opponent && opponent.Status !== 'finished' && opponent.Status !== 'forfeited') {
        const updateGameRequest = new sql.Request(transaction);
        updateGameRequest.input('gameId', sql.Int, gameId);
        await updateGameRequest.query(`
          UPDATE Games
          SET Status = 'completed', UpdatedAt = GETUTCDATE()
          WHERE Id = @gameId
        `);

        await transaction.commit();

        const pusher = getPusherInstance();
        await pusher.trigger(`private-game-${game.RoomCode}`, 'opponent-cheated', {
          cheaterSessionId: sessionId,
          winnerSessionId: opponent.PlayerSessionId,
        });

        await pusher.trigger(`private-game-${game.RoomCode}`, 'game-results', {
          players: [{
            sessionId: opponent.PlayerSessionId,
            finalTime: null,
            correctCount: null,
          }, {
            sessionId: sessionId,
            finalTime: null,
            correctCount: 0,
          }],
          winner: opponent.PlayerSessionId,
          isTie: false,
          cheated: true,
        });

        return res.status(200).json({ 
          success: true,
          forfeited: true,
          message: 'You forfeited due to switching tabs',
          gameResults: {
            players: [{
              sessionId: opponent.PlayerSessionId,
              finalTime: null,
              correctCount: null,
            }, {
              sessionId: sessionId,
              finalTime: null,
              correctCount: 0,
            }],
            winner: opponent.PlayerSessionId,
            isTie: false,
            cheated: true,
          },
          waitingForOpponent: true,
        });
      } else {
        const getAllPlayersRequest = new sql.Request(transaction);
        getAllPlayersRequest.input('gameId', sql.Int, gameId);
        const allPlayersResult = await getAllPlayersRequest.query(`
          SELECT PlayerSessionId, FinalTime, Answers, Status
          FROM GamePlayers
          WHERE GameId = @gameId
        `);

        await transaction.commit();

        const opponentData = allPlayersResult.recordset.find((p: any) => p.PlayerSessionId !== sessionId);
        let opponentCorrectCount = null;
        if (opponentData && opponentData.Status === 'finished' && opponentData.Answers) {
          const opponentAnswers = JSON.parse(opponentData.Answers || '[]');
          opponentCorrectCount = 0;
          for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            const answer = String(opponentAnswers[i] || '').trim();
            const correctAnswer = String(question.answer);
            if (answer === correctAnswer) {
              opponentCorrectCount++;
            }
          }
        }

        const pusher = getPusherInstance();
        await pusher.trigger(`private-game-${game.RoomCode}`, 'game-results', {
          players: [{
            sessionId: opponentData?.PlayerSessionId || '',
            finalTime: opponentData?.FinalTime ? Number(opponentData.FinalTime) : null,
            correctCount: opponentCorrectCount,
          }, {
            sessionId: sessionId,
            finalTime: null,
            correctCount: 0,
          }],
          winner: opponentData?.PlayerSessionId || null,
          isTie: false,
          cheated: true,
        });

        return res.status(200).json({ 
          success: true,
          forfeited: true,
          message: 'You forfeited due to switching tabs',
          gameResults: {
            players: [{
              sessionId: opponentData?.PlayerSessionId || '',
              finalTime: opponentData?.FinalTime ? Number(opponentData.FinalTime) : null,
              correctCount: opponentCorrectCount,
            }, {
              sessionId: sessionId,
              finalTime: null,
              correctCount: 0,
            }],
            winner: opponentData?.PlayerSessionId || null,
            isTie: false,
            cheated: true,
          },
          waitingForOpponent: false,
        });
      }
    }

    let incorrectCount = 0;
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const userAnswer = String(answers[i] || '').trim();
      const correctAnswer = String(question.answer);
      
      if (userAnswer !== correctAnswer) {
        incorrectCount++;
      }
    }

    const penaltySeconds = incorrectCount * 5;
    const finalTimeMs = Math.round((timeTaken + penaltySeconds) * 1000);

    let correctCount = 0;
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const userAnswer = String(answers[i] || '').trim();
      const correctAnswer = String(question.answer);
      if (userAnswer === correctAnswer) {
        correctCount++;
      }
    }

    const updatePlayerRequest = new sql.Request(transaction);
    updatePlayerRequest.input('playerId', sql.Int, player.Id);
    updatePlayerRequest.input('finalTime', sql.BigInt, finalTimeMs);
    updatePlayerRequest.input('answers', sql.NVarChar, JSON.stringify(answers));
    await updatePlayerRequest.query(`
      UPDATE GamePlayers
      SET Status = 'finished', FinalTime = @finalTime, Answers = @answers, UpdatedAt = GETUTCDATE()
      WHERE Id = @playerId
    `);

    const checkPlayersRequest = new sql.Request(transaction);
    checkPlayersRequest.input('gameId', sql.Int, gameId);
    const allPlayersResult = await checkPlayersRequest.query(`
      SELECT PlayerSessionId, FinalTime, Status
      FROM GamePlayers
      WHERE GameId = @gameId
    `);

    const allPlayers = allPlayersResult.recordset;
    const allFinished = allPlayers.every((p: any) => p.Status === 'finished');

    if (allFinished && allPlayers.length === 2) {
      const getPlayerRequest = new sql.Request(transaction);
      getPlayerRequest.input('gameId', sql.Int, gameId);
      const allPlayersDataResult = await getPlayerRequest.query(`
        SELECT PlayerSessionId, FinalTime, Answers
        FROM GamePlayers
        WHERE GameId = @gameId
      `);

      const playersWithAnswers = allPlayersDataResult.recordset.map((p: any) => {
        const playerAnswers = JSON.parse(p.Answers || '[]');
        let correctCount = 0;
        for (let i = 0; i < questions.length; i++) {
          const question = questions[i];
          const userAnswer = String(playerAnswers[i] || '').trim();
          const correctAnswer = String(question.answer);
          if (userAnswer === correctAnswer) {
            correctCount++;
          }
        }
        return {
          sessionId: p.PlayerSessionId,
          finalTime: Number(p.FinalTime),
          correctCount,
        };
      });
      
      const player1 = playersWithAnswers[0];
      const player2 = playersWithAnswers[1];
      
      let winner: string | null = null;
      if (player1.finalTime < player2.finalTime) {
        winner = player1.sessionId;
      } else if (player2.finalTime < player1.finalTime) {
        winner = player2.sessionId;
      } else {
        winner = null;
      }

      const updateGameRequest = new sql.Request(transaction);
      updateGameRequest.input('gameId', sql.Int, gameId);
      await updateGameRequest.query(`
        UPDATE Games
        SET Status = 'completed', UpdatedAt = GETUTCDATE()
        WHERE Id = @gameId
      `);

      await transaction.commit();

      const pusher = getPusherInstance();
      await pusher.trigger(`private-game-${game.RoomCode}`, 'game-results', {
        players: playersWithAnswers,
        winner,
        isTie: winner === null,
      });

      setTimeout(async () => {
        try {
          const cleanupPool = await getPool();
          const checkRequest = cleanupPool.request();
          checkRequest.input('gameId', sql.Int, gameId);
          const checkResult = await checkRequest.query(`
            SELECT Id FROM Games WHERE Id = @gameId
          `);
          
          if (checkResult.recordset.length > 0) {
            const cleanupRequest = cleanupPool.request();
            cleanupRequest.input('gameId', sql.Int, gameId);
            await cleanupRequest.query(`
              DELETE FROM GamePlayers WHERE GameId = @gameId
            `);
            await cleanupRequest.query(`
              DELETE FROM Games WHERE Id = @gameId
            `);
            console.log(`[api/games] Fallback cleanup: Deleted game ${gameId} after 5 minutes`);
          }
        } catch (cleanupError) {
          console.error(`[api/games] Error in fallback cleanup for game ${gameId}:`, cleanupError);
        }
      }, 5 * 60 * 1000);

      return res.status(200).json({ 
        success: true,
        finalTime: finalTimeMs,
        incorrectCount,
        correctCount,
        playerResult: {
          sessionId,
          finalTime: finalTimeMs,
          correctCount,
        },
        gameResults: {
          players: playersWithAnswers,
          winner,
          isTie: winner === null,
        },
        waitingForOpponent: false,
      });
    } else {
      await transaction.commit();

      const pusher = getPusherInstance();
      await pusher.trigger(`private-game-${game.RoomCode}`, 'opponent-finished', {
        sessionId,
        finishedPlayerSessionId: sessionId,
      });

      return res.status(200).json({ 
        success: true,
        finalTime: finalTimeMs,
        incorrectCount,
        correctCount,
        playerResult: {
          sessionId,
          finalTime: finalTimeMs,
          correctCount,
        },
        waitingForOpponent: true,
      });
    }
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/games] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games] Error:', error);
    return res.status(500).json({ message: 'Failed to submit answers', error: error.message });
  }
}

async function handlePlayAgain(req: any, res: any) {
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
    
    const updatePlayerRequest = new sql.Request(transaction);
    updatePlayerRequest.input('playerId', sql.Int, player.Id);
    await updatePlayerRequest.query(`
      UPDATE GamePlayers
      SET Status = 'play_again', UpdatedAt = GETUTCDATE()
      WHERE Id = @playerId
    `);

    const checkPlayAgainRequest = new sql.Request(transaction);
    checkPlayAgainRequest.input('gameId', sql.Int, gameId);
    const playAgainResult = await checkPlayAgainRequest.query(`
      SELECT COUNT(*) as count
      FROM GamePlayers
      WHERE GameId = @gameId AND Status = 'play_again'
    `);

    const playAgainCount = playAgainResult.recordset[0].count;

    if (playAgainCount >= 2) {
      const operation: Operation = 'multiplication';
      const selectedNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

      const resetPlayersRequest = new sql.Request(transaction);
      resetPlayersRequest.input('gameId', sql.Int, gameId);
      await resetPlayersRequest.query(`
        UPDATE GamePlayers
        SET Status = 'playing', Answers = NULL, FinalTime = NULL, UpdatedAt = GETUTCDATE()
        WHERE GameId = @gameId
      `);

      const resetGameRequest = new sql.Request(transaction);
      resetGameRequest.input('gameId', sql.Int, gameId);
      resetGameRequest.input('gameSettings', sql.NVarChar, JSON.stringify({ operation, selectedNumbers }));
      await resetGameRequest.query(`
        UPDATE Games
        SET Status = 'waiting', Questions = @gameSettings, UpdatedAt = GETUTCDATE()
        WHERE Id = @gameId
      `);

      await transaction.commit();

      const pusher = getPusherInstance();
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

      const pusher = getPusherInstance();
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
        console.error('[api/games] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games] Error:', error);
    return res.status(500).json({ message: 'Failed to process play again', error: error.message });
  }
}

async function handlePlayAgainStatus(req: any, res: any) {
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
    const playersRequest = pool.request();
    playersRequest.input('gameId', sql.Int, parseInt(gameId, 10));
    
    const playersResult = await playersRequest.query(`
      SELECT PlayerSessionId, Status
      FROM GamePlayers
      WHERE GameId = @gameId
    `);

    let playAgainCount = 0;
    let hasClicked = false;

    for (const p of playersResult.recordset) {
      if (p.Status === 'play_again') {
        playAgainCount++;
        if (p.PlayerSessionId === sessionId) {
          hasClicked = true;
        }
      }
    }

    return res.status(200).json({
      count: playAgainCount,
      hasClicked,
    });
  } catch (error) {
    console.error('[api/games] Error:', error);
    return res.status(500).json({ message: 'Failed to get play again status', error: error.message });
  }
}

