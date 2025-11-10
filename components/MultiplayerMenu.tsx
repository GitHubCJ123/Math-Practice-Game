import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Operation } from '../types';

interface MultiplayerMenuProps {
  onBack: () => void;
}

export const MultiplayerMenu: React.FC<MultiplayerMenuProps> = ({ onBack }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoinGame = async (codeToJoin?: string) => {
    const code = codeToJoin || roomCode;
    if (!code || code.length !== 6) {
      setError('Please enter a valid 6-character room code');
      return;
    }

    setIsLoading(true);
    setError('');

    // For joining, we need operation and selectedNumbers
    // For simplicity, we'll use default values - in a real app, you'd want a selection screen
    const operation: Operation = 'multiplication';
    const selectedNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    try {
      const response = await fetch('/api/games/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: code.toUpperCase(),
          operation,
          selectedNumbers,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to join game' }));
        throw new Error(errorData.message || `Failed to join game (${response.status})`);
      }

      const data = await response.json();
      // Always go to lobby after joining (game won't start automatically)
      navigate(`/lobby/${data.gameId}`, { state: { roomCode: code.toUpperCase(), sessionId: data.sessionId } });
    } catch (err: any) {
      setError(err.message || 'Failed to join game. Make sure the room code is correct and the game is still waiting for players.');
      setIsLoading(false);
    }
  };

  // Check if there's a 'join' parameter in the URL
  useEffect(() => {
    const joinCode = searchParams.get('join');
    if (joinCode && joinCode.length === 6) {
      setRoomCode(joinCode.toUpperCase());
      // Auto-join if code is in URL
      handleJoinGame(joinCode.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleCreateGame = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/games/create', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to create game' }));
        throw new Error(errorData.message || `Failed to create game (${response.status})`);
      }

      const data = await response.json();
      navigate(`/lobby/${data.gameId}`, { state: { roomCode: data.roomCode, sessionId: data.sessionId } });
    } catch (err: any) {
      setError(err.message || 'Failed to create game');
      setIsLoading(false);
    }
  };

  const handleRandomMatch = async () => {
    setIsLoading(true);
    setError('');

    const operation: Operation = 'multiplication';
    const selectedNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    try {
      const response = await fetch(`/api/games/random?operation=${operation}&selectedNumbers=${JSON.stringify(selectedNumbers)}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to find match');
      }

      const data = await response.json();
      
      // Always navigate to matchmaking screen first
      // The matchmaking screen will handle receiving the match-found event via Pusher
      // This ensures both players go through the same flow and can receive Pusher events
      navigate('/matchmaking', {
        state: {
          sessionId: data.sessionId,
          pusherChannel: data.pusherChannel || `private-matchmaking-${data.sessionId}`,
          // If already matched, include match data so the screen can navigate immediately
          matchData: data.matched && data.questions ? {
            gameId: data.gameId,
            roomCode: data.roomCode,
            questions: data.questions,
            startTime: data.startTime,
          } : null,
        },
      });
    } catch (err: any) {
      setError(err.message || 'Failed to find match');
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800">
      <div className="text-center mb-8">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-white mb-2">1v1 Online Match</h1>
        <p className="text-lg text-slate-600 dark:text-slate-300">Challenge a friend or find a random opponent!</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-500/10 border-2 border-red-500 rounded-lg text-red-700 dark:text-red-400 text-center">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <button
          onClick={handleRandomMatch}
          disabled={isLoading}
          className="w-full px-8 py-4 text-xl font-bold text-white bg-blue-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
        >
          {isLoading ? 'Finding Match...' : 'Find Random Match'}
        </button>

        <button
          onClick={handleCreateGame}
          disabled={isLoading}
          className="w-full px-8 py-4 text-xl font-bold text-white bg-green-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
        >
          {isLoading ? 'Creating...' : 'Create Private Game'}
        </button>

        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <p className="text-center text-slate-600 dark:text-slate-400 mb-4">Or join a friend's game:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="Enter Room Code"
              maxLength={6}
              className="flex-1 px-4 py-3 text-xl font-bold text-center border-2 border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 uppercase"
            />
            <button
              onClick={() => handleJoinGame()}
              disabled={isLoading || roomCode.length !== 6}
              className="px-8 py-3 text-lg font-bold text-white bg-purple-600 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
            >
              Join
            </button>
          </div>
        </div>

        <button
          onClick={onBack}
          className="w-full px-8 py-3 text-lg font-semibold text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
        >
          Back to Main Menu
        </button>
      </div>
    </div>
  );
};

