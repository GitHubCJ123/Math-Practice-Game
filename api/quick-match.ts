import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPusher } from "./pusher";
import {
  createRoom,
  addToQuickMatchQueue,
  removeFromQuickMatchQueue,
  findQuickMatchOpponent,
  joinRoom,
  getRoom,
} from "./room-store";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[API QuickMatch] ========== REQUEST RECEIVED ==========')
  console.log('[API QuickMatch] Method:', req.method);
  console.log('[API QuickMatch] Body:', req.body);
  
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    console.log('[API QuickMatch] OPTIONS request, returning 200');
    return res.status(200).end();
  }

  // Cancel queue
  if (req.method === "DELETE") {
    console.log('[API QuickMatch] DELETE request - canceling queue');
    const { odId } = req.body;
    if (odId) {
      removeFromQuickMatchQueue(odId);
    }
    return res.status(200).json({ success: true });
  }

  if (req.method !== "POST") {
    console.log('[API QuickMatch] Invalid method:', req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { odId, odName, operation } = req.body;
    console.log('[API QuickMatch] POST request - player:', odId, 'name:', odName, 'operation:', operation);

    if (!odId || !odName || !operation) {
      console.log('[API QuickMatch] Missing required fields');
      return res.status(400).json({ error: "Player ID, name, and operation are required" });
    }

    // Check if there's someone waiting in queue for the same operation
    console.log('[API QuickMatch] Looking for opponent...');
    const opponent = findQuickMatchOpponent(odId, operation);
    console.log('[API QuickMatch] Opponent search result:', opponent);

    if (opponent) {
      console.log('[API QuickMatch] MATCH FOUND! Creating room...');
      // Found an opponent! Create a room and add both players
      const room = createRoom(opponent.odId, opponent.odName, true);
      
      // Set quick match settings (all numbers, 10 questions, no time limit)
      const allNumbers = operation === "squares" || operation === "square-roots"
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
        : operation === "negative-numbers"
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

      room.settings = {
        operation: operation as any,
        selectedNumbers: allNumbers,
        questionCount: 10,
        timeLimit: 0,
      };

      // Add the current player to the room
      joinRoom(room.code, odId, odName.substring(0, 20));

      const pusher = getPusher();

      // Notify the waiting player that a match was found
      await pusher.trigger(`quickmatch-${opponent.odId}`, "match-found", {
        roomId: room.id,
        roomCode: room.code,
        opponent: { id: odId, name: odName },
        operation: operation,
      });

      console.log('[API QuickMatch] Returning matched response');
      return res.status(200).json({
        success: true,
        matched: true,
        roomId: room.id,
        roomCode: room.code,
        opponent: { id: opponent.odId, name: opponent.odName },
      });
    } else {
      // No opponent found, add to queue
      console.log('[API QuickMatch] No opponent found, adding to queue...');
      addToQuickMatchQueue(odId, odName, operation);
      console.log('[API QuickMatch] Added to queue, returning waiting response');

      return res.status(200).json({
        success: true,
        matched: false,
        message: "Added to queue, waiting for opponent",
      });
    }
  } catch (error) {
    console.error("Error in quick match:", error);
    return res.status(500).json({ error: "Failed to process quick match" });
  }
}
