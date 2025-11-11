import Pusher from 'pusher';
import { getPool } from '../../lib/db-pool.js';
import sql from 'mssql';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

export default async function handler(req: any, res: any) {
  console.log('[api/pusher/auth] Function invoked.');
  console.log('[api/pusher/auth] Method:', req.method);
  console.log('[api/pusher/auth] Body:', req.body);
  console.log('[api/pusher/auth] Query:', req.query);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Pusher sends data as form-encoded, so it might be in req.body or req.query
  const socket_id = req.body?.socket_id || req.query?.socket_id;
  const channel_name = req.body?.channel_name || req.query?.channel_name;

  console.log('[api/pusher/auth] Extracted:', { socket_id, channel_name });

  if (!socket_id || !channel_name) {
    return res.status(400).json({ message: 'socket_id and channel_name are required' });
  }

  // Extract gameId from channel name (format: private-game-ROOMCODE or private-matchmaking-SESSIONID)
  // For authentication, we'll use a simpler approach: check if the channel name matches a valid game or matchmaking queue
  // In a production app, you'd want to verify the session ID from cookies/headers
  const gameChannelMatch = channel_name.match(/^private-game-([A-Z0-9]{6})$/);
  const matchmakingChannelMatch = channel_name.match(/^private-matchmaking-(.+)$/);
  
  if (!gameChannelMatch && !matchmakingChannelMatch) {
    console.log('[api/pusher/auth] Invalid channel format:', channel_name);
    return res.status(400).json({ message: 'Invalid channel name format' });
  }

  try {
    if (gameChannelMatch) {
      // Handle game channel authentication
      const roomCode = gameChannelMatch[1];

      // Verify the game exists
      const pool = await getPool();
      const gameResult = await pool.request()
        .input('roomCode', sql.NVarChar, roomCode)
        .query(`
          SELECT Id FROM Games WHERE UPPER(RoomCode) = UPPER(@roomCode)
        `);

      if (gameResult.recordset.length === 0) {
        console.log('[api/pusher/auth] Game not found for roomCode:', roomCode);
        return res.status(403).json({ message: 'Game not found' });
      }

      // For now, we'll allow authentication if the game exists
      // In production, you'd want to verify the session ID from cookies/headers
      const auth = pusher.authorizeChannel(socket_id, channel_name);
      console.log('[api/pusher/auth] Authorization successful for game channel');
      return res.status(200).json(auth);
    } else if (matchmakingChannelMatch) {
      // Handle matchmaking channel authentication
      const sessionId = matchmakingChannelMatch[1];

      // Verify the session is in the matchmaking queue
      const pool = await getPool();
      const queueResult = await pool.request()
        .input('sessionId', sql.NVarChar, sessionId)
        .query(`
          SELECT Id FROM MatchmakingQueue WHERE PlayerSessionId = @sessionId
        `);

      if (queueResult.recordset.length === 0) {
        console.log('[api/pusher/auth] Session not found in matchmaking queue:', sessionId);
        return res.status(403).json({ message: 'Session not in matchmaking queue' });
      }

      const auth = pusher.authorizeChannel(socket_id, channel_name);
      console.log('[api/pusher/auth] Authorization successful for matchmaking channel');
      return res.status(200).json(auth);
    }
  } catch (error) {
    console.error('[api/pusher/auth] Error:', error);
    return res.status(500).json({ message: 'Authentication failed', error: error.message });
  }
}

