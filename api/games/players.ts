import sql from 'mssql';
import { getPool } from '../db-pool.js';

export default async function handler(req: any, res: any) {
  console.log('[api/games/players] Function invoked.');
  
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
      SELECT PlayerSessionId, Id
      FROM GamePlayers
      WHERE GameId = @gameId
      ORDER BY Id ASC
    `);

    const players = playersResult.recordset;
    const playerCount = players.length;
    
    // First player (lowest Id) is the host
    const isHost = playerCount > 0 && players[0].PlayerSessionId === sessionId;

    return res.status(200).json({
      playerCount,
      isHost,
      players: players.map((p: any) => ({ sessionId: p.PlayerSessionId })),
    });
  } catch (error) {
    console.error('[api/games/players] Error:', error);
    return res.status(500).json({ message: 'Failed to get players', error: error.message });
  }
}


