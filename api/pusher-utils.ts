import Pusher from 'pusher';
import { getPool } from './db-pool.js';
import sql from 'mssql';

// Initialize Pusher instance
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

export function getPusherInstance(): Pusher {
  return pusher;
}

// Generate a unique 6-digit room code
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate a unique session ID for a player
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Verify that a player is part of a game
export async function verifyPlayerInGame(gameId: number, sessionId: string): Promise<boolean> {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('gameId', sql.Int, gameId)
      .input('sessionId', sql.NVarChar, sessionId)
      .query(`
        SELECT COUNT(*) as count
        FROM GamePlayers
        WHERE GameId = @gameId AND PlayerSessionId = @sessionId
      `);
    
    return result.recordset[0].count > 0;
  } catch (error) {
    console.error('[verifyPlayerInGame] Error:', error);
    return false;
  }
}

