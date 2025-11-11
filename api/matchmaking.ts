import sql from 'mssql';
import { getPool } from '../lib/db-pool.js';

export default async function handler(req: any, res: any) {
  // Get action from query or body
  const action = req.query.action || req.body.action;

  if (!action) {
    return res.status(400).json({ message: 'action parameter is required' });
  }

  console.log(`[api/matchmaking] Function invoked with action: ${action}`);

  // Route to appropriate handler based on action
  switch (action) {
    case 'cancel':
      return handleCancel(req, res);
    case 'check':
      return handleCheck(req, res);
    case 'count':
      return handleCount(req, res);
    default:
      return res.status(400).json({ message: `Unknown action: ${action}` });
  }
}

async function handleCancel(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('sessionId', sql.NVarChar, sessionId);
    
    await request.query(`
      DELETE FROM MatchmakingQueue
      WHERE PlayerSessionId = @sessionId
    `);

    return res.status(200).json({ message: 'Removed from matchmaking queue' });
  } catch (error) {
    console.error('[api/matchmaking] Error:', error);
    return res.status(500).json({ message: 'Failed to cancel matchmaking', error: error.message });
  }
}

async function handleCheck(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  try {
    const pool = await getPool();
    
    const queueCheckRequest = pool.request();
    queueCheckRequest.input('sessionId', sql.NVarChar, sessionId);
    const queueResult = await queueCheckRequest.query(`
      SELECT COUNT(*) as count
      FROM MatchmakingQueue
      WHERE PlayerSessionId = @sessionId
    `);

    const inQueue = queueResult.recordset[0].count > 0;

    if (inQueue) {
      return res.status(200).json({ matched: false });
    }

    const gameCheckRequest = pool.request();
    gameCheckRequest.input('sessionId', sql.NVarChar, sessionId);
    const gameResult = await gameCheckRequest.query(`
      SELECT TOP 1 g.Id as GameId, g.RoomCode, g.Status
      FROM Games g
      INNER JOIN GamePlayers gp ON g.Id = gp.GameId
      WHERE gp.PlayerSessionId = @sessionId
        AND g.Status IN ('waiting', 'in_progress')
      ORDER BY g.CreatedAt DESC
    `);

    if (gameResult.recordset.length > 0) {
      const game = gameResult.recordset[0];
      return res.status(200).json({ 
        matched: true,
        gameId: game.GameId,
        roomCode: game.RoomCode,
      });
    }

    return res.status(200).json({ matched: false });
  } catch (error: any) {
    console.error('[api/matchmaking] Error:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}

async function handleCount(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT COUNT(*) as count
      FROM MatchmakingQueue
    `);

    const count = result.recordset[0].count || 0;
    return res.status(200).json({ count });
  } catch (error: any) {
    console.error('[api/matchmaking] Error getting queue count:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}

