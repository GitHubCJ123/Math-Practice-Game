import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Pusher, { Channel } from "pusher-js";
import type { Operation, RoomSettings, Player, Question } from "../types";
import {
  getPusherClient,
  createRoom,
  joinRoom,
  updateRoomSettings,
  startGame,
  startReadyPhase,
  quickMatch,
  cancelQuickMatch,
  leaveRoom,
  setReady,
  getOrCreatePlayerId,
} from "../lib/multiplayer";
import { SunIcon, MoonIcon } from "./icons";

interface MultiplayerLobbyScreenProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onGameStart: (
    roomId: string,
    odId: string,
    odName: string,
    questions: Question[],
    isHost: boolean,
    opponent: { id: string; name: string }
  ) => void;
  rematchData?: {
    roomId: string;
    roomCode: string;
    isQuickMatch: boolean;
    players: any[];
    settings: any;
  } | null;
  onRematchConsumed?: () => void;
}

type LobbyTab = "create" | "join" | "quickmatch";

const operationLabels: Record<Operation, string> = {
  multiplication: "Multiplication",
  division: "Division",
  squares: "Squares",
  "square-roots": "Square Roots",
  "fraction-to-decimal": "Fraction → Decimal",
  "decimal-to-fraction": "Decimal → Fraction",
  "fraction-to-percent": "Fraction → Percent",
  "percent-to-fraction": "Percent → Fraction",
  "negative-numbers": "Negative Numbers",
};

const getNumbersForOperation = (op: Operation): number[] => {
  if (op === "squares" || op === "square-roots") {
    return Array.from({ length: 20 }, (_, i) => i + 1);
  }
  if (op === "negative-numbers") {
    return Array.from({ length: 10 }, (_, i) => i + 1);
  }
  return Array.from({ length: 12 }, (_, i) => i + 1);
};

export const MultiplayerLobbyScreen: React.FC<MultiplayerLobbyScreenProps> = ({
  isDarkMode,
  toggleDarkMode,
  onGameStart,
  rematchData,
  onRematchConsumed,
}) => {
  const navigate = useNavigate();
  const { roomCode: joinCodeFromUrl } = useParams<{ roomCode?: string }>();

  const [activeTab, setActiveTab] = useState<LobbyTab>(joinCodeFromUrl ? "join" : "create");
  const [playerName, setPlayerName] = useState(() => localStorage.getItem("mathWhizPlayerName") || "");
  const [playerId] = useState(() => getOrCreatePlayerId());

  // Room state
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string>("");
  const [joinUrl, setJoinUrl] = useState<string>("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [isQuickMatchRoom, setIsQuickMatchRoom] = useState(false);

  // Settings (for host in private rooms)
  const [operation, setOperation] = useState<Operation>("multiplication");
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const [questionCount, setQuestionCount] = useState(10);
  const [timeLimit, setTimeLimit] = useState(0);

  // Join state
  const [joinCodeInput, setJoinCodeInput] = useState(joinCodeFromUrl || "");
  const [joinError, setJoinError] = useState<string | null>(null);

  // Quick match state
  const [quickMatchOperation, setQuickMatchOperation] = useState<Operation>("multiplication");
  const [isSearching, setIsSearching] = useState(false);
  const [myReady, setMyReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [showReadyScreen, setShowReadyScreen] = useState(false);

  // Pusher channel
  const [channel, setChannel] = useState<Channel | null>(null);

  // Loading states
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Handle rematch data - set up the room and show ready screen
  useEffect(() => {
    if (rematchData && rematchData.roomId) {
      console.log('[Lobby] Rematch data received:', rematchData);
      setRoomId(rematchData.roomId);
      setRoomCode(rematchData.roomCode);
      setInRoom(true);
      setIsQuickMatchRoom(rematchData.isQuickMatch);
      setOperation(rematchData.settings.operation);
      setSelectedNumbers(rematchData.settings.selectedNumbers || [1,2,3,4,5,6,7,8,9,10,11,12]);
      setQuestionCount(rematchData.settings.questionCount || 10);
      setTimeLimit(rematchData.settings.timeLimit || 0);
      setPlayers(rematchData.players.map((p: any) => ({
        ...p,
        isReady: false, // Reset ready status for new game
      })));
      // Determine if current player is the host
      const meInPlayers = rematchData.players.find((p: any) => p.id === playerId);
      setIsHost(meInPlayers?.isHost || false);
      setMyReady(false);
      setOpponentReady(false);
      // Clear the rematch data so it doesn't re-trigger
      if (onRematchConsumed) {
        onRematchConsumed();
      }
    }
  }, [rematchData, onRematchConsumed, playerId]);

  // Save player name to localStorage
  useEffect(() => {
    if (playerName) {
      localStorage.setItem("mathWhizPlayerName", playerName);
    }
  }, [playerName]);

  // Subscribe to room channel when we join
  useEffect(() => {
    if (!roomId) return;

    const pusher = getPusherClient();
    const roomChannel = pusher.subscribe(`room-${roomId}`);
    setChannel(roomChannel);

    roomChannel.bind("player-joined", (data: { player: Player }) => {
      console.log('[Lobby] player-joined event:', data);
      setPlayers((prev) => {
        if (prev.find((p) => p.id === data.player.id)) return prev;
        return [...prev, data.player];
      });
    });

    roomChannel.bind("player-left", (data: { playerId: string }) => {
      console.log('[Lobby] player-left event:', data);
      if (data.playerId !== playerId && isQuickMatchRoom) {
        // Opponent left - show the opponent left UI only for quick match rooms
        setOpponentLeft(true);
      }
      setPlayers((prev) => prev.filter((p) => p.id !== data.playerId));
    });

    roomChannel.bind("player-ready", (data: { odId: string; isReady: boolean }) => {
      console.log('[Lobby] player-ready event:', data);
      if (data.odId !== playerId) {
        setOpponentReady(data.isReady);
      }
      setPlayers((prev) =>
        prev.map((p) => (p.id === data.odId ? { ...p, isReady: data.isReady } : p))
      );
    });

    roomChannel.bind("settings-updated", (data: { settings: RoomSettings }) => {
      console.log('[Lobby] settings-updated event:', data);
      setOperation(data.settings.operation);
      setSelectedNumbers(data.settings.selectedNumbers);
      setQuestionCount(data.settings.questionCount);
      setTimeLimit(data.settings.timeLimit);
    });

    roomChannel.bind("ready-phase", () => {
      console.log('[Lobby] ready-phase event received');
      setShowReadyScreen(true);
      setMyReady(false);
      setOpponentReady(false);
    });

    roomChannel.bind("game-starting", (data: { questions: Question[] }) => {
      console.log('[Lobby] game-starting event:', data);
      const opponent = players.find((p) => p.id !== playerId);
      if (opponent) {
        onGameStart(roomId, playerId, playerName, data.questions, isHost, {
          id: opponent.id,
          name: opponent.name,
        });
      }
    });

    roomChannel.bind("player-disconnected", (data: { odId: string }) => {
      console.log('[Lobby] player-disconnected event:', data);
      setPlayers((prev) =>
        prev.map((p) => (p.id === data.odId ? { ...p, connected: false } : p))
      );
    });

    return () => {
      pusher.unsubscribe(`room-${roomId}`);
      setChannel(null);
    };
  }, [roomId, playerId, playerName, isHost, onGameStart, players]);

  // Quick match channel subscription
  useEffect(() => {
    if (!isSearching) return;

    const pusher = getPusherClient();
    const qmChannel = pusher.subscribe(`quickmatch-${playerId}`);

    qmChannel.bind("match-found", (data: { roomId: string; roomCode: string; opponent: { id: string; name: string }; operation: string }) => {
      console.log('[Lobby] match-found event:', data);
      setIsSearching(false);
      setRoomId(data.roomId);
      setRoomCode(data.roomCode);
      setInRoom(true);
      setIsQuickMatchRoom(true);
      setIsHost(false); // No host in quick match
      setOperation(data.operation as Operation);
      setPlayers([
        { id: playerId, name: playerName, isHost: false, isReady: false, connected: true },
        { id: data.opponent.id, name: data.opponent.name, isHost: false, isReady: false, connected: true },
      ]);
    });

    return () => {
      pusher.unsubscribe(`quickmatch-${playerId}`);
    };
  }, [isSearching, playerId, playerName]);

  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      alert("Please enter your name");
      return;
    }

    setIsCreating(true);
    try {
      const result = await createRoom(playerId, playerName);
      if (result.success && result.roomId) {
        setRoomId(result.roomId);
        setRoomCode(result.roomCode || "");
        setJoinUrl(result.joinUrl || "");
        setIsHost(true);
        setInRoom(true);
        setIsQuickMatchRoom(false);
        setPlayers([{ id: playerId, name: playerName, isHost: true, isReady: false, connected: true }]);
      } else {
        alert(result.error || "Failed to create room");
      }
    } catch (error) {
      console.error("Error creating room:", error);
      alert("Failed to create room");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!playerName.trim()) {
      alert("Please enter your name");
      return;
    }
    if (!joinCodeInput.trim()) {
      setJoinError("Please enter a room code");
      return;
    }

    setIsJoining(true);
    setJoinError(null);
    try {
      const result = await joinRoom(joinCodeInput.toUpperCase(), playerId, playerName);
      if (result.success && result.roomId) {
        setRoomId(result.roomId);
        setRoomCode(joinCodeInput.toUpperCase());
        setIsHost(false);
        setInRoom(true);
        setIsQuickMatchRoom(false);
        setPlayers(result.room.players);
        setOperation(result.room.settings.operation);
        setSelectedNumbers(result.room.settings.selectedNumbers);
        setQuestionCount(result.room.settings.questionCount);
        setTimeLimit(result.room.settings.timeLimit);
      } else {
        setJoinError(result.error || "Failed to join room");
      }
    } catch (error) {
      console.error("Error joining room:", error);
      setJoinError("Failed to join room");
    } finally {
      setIsJoining(false);
    }
  };

  const handleStartGame = async () => {
    if (!roomId) return;
    if (players.length < 2) {
      alert("Need 2 players to start");
      return;
    }

    setIsStarting(true);
    try {
      // Trigger ready phase with current settings
      const result = await startReadyPhase(roomId, playerId, {
        operation,
        selectedNumbers,
        questionCount,
        timeLimit,
      });
      if (!result.success) {
        alert(result.error || "Failed to start ready phase");
      }
    } catch (error) {
      console.error("Error starting ready phase:", error);
      alert("Failed to start ready phase");
    } finally {
      setIsStarting(false);
    }
  };

  const handleQuickMatch = async () => {
    console.log('[Lobby] handleQuickMatch called');
    console.log('[Lobby] playerName:', playerName);
    console.log('[Lobby] playerId:', playerId);
    console.log('[Lobby] quickMatchOperation:', quickMatchOperation);
    
    if (!playerName.trim()) {
      alert("Please enter your name");
      return;
    }

    setIsSearching(true);
    console.log('[Lobby] Set isSearching=true, calling quickMatch API...');
    try {
      const result = await quickMatch(playerId, playerName, quickMatchOperation);
      console.log('[Lobby] quickMatch result:', result);
      if (result.success && result.matched && result.roomId) {
        // We found an opponent immediately
        setRoomId(result.roomId);
        setRoomCode(result.roomCode || "");
        setInRoom(true);
        setIsQuickMatchRoom(true);
        setIsHost(false); // No host in quick match
        setOperation(quickMatchOperation);
        if (result.opponent) {
          setPlayers([
            { id: result.opponent.id, name: result.opponent.name, isHost: false, isReady: false, connected: true },
            { id: playerId, name: playerName, isHost: false, isReady: false, connected: true },
          ]);
        }
        setIsSearching(false);
      }
      // If not matched, we stay in searching state and wait for match-found event
    } catch (error) {
      console.error("Error in quick match:", error);
      setIsSearching(false);
      alert("Failed to start matchmaking");
    }
  };

  const handleCancelSearch = async () => {
    setIsSearching(false);
    await cancelQuickMatch(playerId);
  };

  const handleSetReady = async () => {
    if (!roomId) return;
    const newReady = !myReady;
    setMyReady(newReady);
    try {
      const result = await setReady(roomId, playerId, newReady);
      console.log('[Lobby] setReady result:', result);
      // Game will auto-start via Pusher event when both ready
    } catch (error) {
      console.error("Error setting ready:", error);
      setMyReady(!newReady); // Revert on error
    }
  };

  const handleSettingsChange = useCallback(
    async (newSettings: Partial<RoomSettings>) => {
      if (!roomId || !isHost) return;
      const merged = {
        operation: newSettings.operation ?? operation,
        selectedNumbers: newSettings.selectedNumbers ?? selectedNumbers,
        questionCount: newSettings.questionCount ?? questionCount,
        timeLimit: newSettings.timeLimit ?? timeLimit,
      };
      await updateRoomSettings(roomId, playerId, merged);
    },
    [roomId, isHost, playerId, operation, selectedNumbers, questionCount, timeLimit]
  );

  const toggleNumber = (num: number) => {
    const newNumbers = selectedNumbers.includes(num)
      ? selectedNumbers.filter((n) => n !== num)
      : [...selectedNumbers, num];
    if (newNumbers.length > 0) {
      setSelectedNumbers(newNumbers);
      if (isHost && roomId) {
        handleSettingsChange({ selectedNumbers: newNumbers });
      }
    }
  };

  const selectAllNumbers = () => {
    const allNums = getNumbersForOperation(operation);
    setSelectedNumbers(allNums);
    if (isHost && roomId) {
      handleSettingsChange({ selectedNumbers: allNums });
    }
  };

  const clearNumbers = () => {
    setSelectedNumbers([1]);
    if (isHost && roomId) {
      handleSettingsChange({ selectedNumbers: [1] });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // QUICK MATCH READY SCREEN
  if (inRoom && isQuickMatchRoom) {
    const opponent = players.find((p) => p.id !== playerId);
    
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 transition-colors duration-300">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <button
              onClick={async () => {
                // Notify server so opponent gets player-left event
                if (roomId) {
                  await leaveRoom(roomId, playerId, playerName);
                }
                setInRoom(false);
                setRoomId(null);
                setPlayers([]);
                setMyReady(false);
                setOpponentReady(false);
                setOpponentLeft(false);
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              ← Leave Match
            </button>
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              aria-label="Toggle dark mode"
            >
              {isDarkMode ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
            </button>
          </div>

          {/* Ready Screen Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 md:p-8">
            {/* Opponent Left UI */}
            {opponentLeft ? (
              <>
                <div className="text-center mb-6">
                  <div className="text-6xl mb-4">😔</div>
                  <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white mb-2">
                    Opponent Left
                  </h1>
                  <p className="text-slate-500 dark:text-slate-400">
                    Your opponent has left the match before it started.
                  </p>
                </div>
                <div className="flex flex-col gap-4">
                  <button
                    onClick={() => {
                      // Reset state and go back to searching
                      setInRoom(false);
                      setRoomId(null);
                      setPlayers([]);
                      setMyReady(false);
                      setOpponentReady(false);
                      setOpponentLeft(false);
                      // Immediately start searching again
                      handleQuickMatch();
                    }}
                    className="w-full py-4 rounded-xl text-xl font-bold bg-purple-600 text-white hover:bg-purple-700 transition-all transform hover:scale-[1.02]"
                  >
                    Continue Matchmaking
                  </button>
                  <button
                    onClick={() => {
                      setInRoom(false);
                      setRoomId(null);
                      setPlayers([]);
                      setMyReady(false);
                      setOpponentReady(false);
                      setOpponentLeft(false);
                    }}
                    className="w-full py-3 rounded-xl text-lg font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                  >
                    Back to Menu
                  </button>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-2xl md:text-3xl font-bold text-center text-slate-800 dark:text-white mb-2">
                  Match Found!
                </h1>
                <p className="text-center text-slate-500 dark:text-slate-400 mb-6">
                  {operationLabels[operation]} • 10 Questions • All Numbers • No Time Limit
                </p>

                {/* Players Ready Status */}
                <div className="grid grid-cols-2 gap-6 mb-8">
                  {/* You */}
                  <div className={`p-6 rounded-2xl border-2 text-center transition-all ${
                    myReady 
                      ? "bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-600" 
                      : "bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                  }`}>
                    <div className="text-4xl mb-3">{myReady ? "✅" : "⏳"}</div>
                    <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-1">
                      {playerName}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">You</p>
                    <p className={`text-sm font-semibold mt-2 ${myReady ? "text-green-600 dark:text-green-400" : "text-slate-400"}`}>
                      {myReady ? "READY" : "Not Ready"}
                    </p>
                  </div>

                  {/* Opponent */}
                  <div className={`p-6 rounded-2xl border-2 text-center transition-all ${
                    opponentReady 
                      ? "bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-600" 
                      : "bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                  }`}>
                    <div className="text-4xl mb-3">{opponentReady ? "✅" : "⏳"}</div>
                    <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-1">
                      {opponent?.name || "Opponent"}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Opponent</p>
                    <p className={`text-sm font-semibold mt-2 ${opponentReady ? "text-green-600 dark:text-green-400" : "text-slate-400"}`}>
                      {opponentReady ? "READY" : "Not Ready"}
                    </p>
                  </div>
                </div>

                {/* Ready Button */}
                <button
                  onClick={handleSetReady}
                  className={`w-full py-4 rounded-xl text-xl font-bold transition-all transform hover:scale-[1.02] ${
                    myReady
                      ? "bg-yellow-500 text-white hover:bg-yellow-600"
                      : "bg-green-600 text-white hover:bg-green-700"
                  }`}
                >
                  {myReady ? "Cancel Ready" : "I'm Ready!"}
                </button>

                {myReady && !opponentReady && (
                  <p className="text-center text-slate-500 dark:text-slate-400 mt-4 animate-pulse">
                    Waiting for opponent to be ready...
                  </p>
                )}
                {myReady && opponentReady && (
                  <p className="text-center text-green-600 dark:text-green-400 mt-4 font-semibold animate-pulse">
                    Starting game...
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // PRIVATE ROOM READY SCREEN (after host clicks Start Game)
  if (inRoom && !isQuickMatchRoom && showReadyScreen) {
    const opponent = players.find((p) => p.id !== playerId);
    
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 transition-colors duration-300">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <button
              onClick={async () => {
                if (roomId) {
                  await leaveRoom(roomId, playerId, playerName);
                }
                setInRoom(false);
                setRoomId(null);
                setPlayers([]);
                setShowReadyScreen(false);
                setMyReady(false);
                setOpponentReady(false);
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              ← Leave Room
            </button>
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              aria-label="Toggle dark mode"
            >
              {isDarkMode ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
            </button>
          </div>

          {/* Ready Screen Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 md:p-8">
            <h1 className="text-2xl md:text-3xl font-bold text-center text-slate-800 dark:text-white mb-2">
              Get Ready!
            </h1>
            <p className="text-center text-slate-500 dark:text-slate-400 mb-6">
              {operationLabels[operation]} • {questionCount} Questions • {timeLimit > 0 ? `${timeLimit}s` : 'No Time Limit'}
            </p>

            {/* Players Ready Status */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {/* You */}
              <div className={`p-6 rounded-2xl border-2 text-center transition-all ${
                myReady 
                  ? "bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-600" 
                  : "bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-600"
              }`}>
                <div className="text-4xl mb-3">{myReady ? "✅" : "⏳"}</div>
                <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-1">
                  {playerName}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">You</p>
                <p className={`text-sm font-semibold mt-2 ${myReady ? "text-green-600 dark:text-green-400" : "text-slate-400"}`}>
                  {myReady ? "READY" : "Not Ready"}
                </p>
              </div>

              {/* Opponent */}
              <div className={`p-6 rounded-2xl border-2 text-center transition-all ${
                opponentReady 
                  ? "bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-600" 
                  : "bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-600"
              }`}>
                <div className="text-4xl mb-3">{opponentReady ? "✅" : "⏳"}</div>
                <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-1">
                  {opponent?.name || "Opponent"}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Opponent</p>
                <p className={`text-sm font-semibold mt-2 ${opponentReady ? "text-green-600 dark:text-green-400" : "text-slate-400"}`}>
                  {opponentReady ? "READY" : "Not Ready"}
                </p>
              </div>
            </div>

            {/* Ready Button */}
            <button
              onClick={handleSetReady}
              className={`w-full py-4 rounded-xl text-xl font-bold transition-all transform hover:scale-[1.02] ${
                myReady
                  ? "bg-yellow-500 text-white hover:bg-yellow-600"
                  : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              {myReady ? "Cancel Ready" : "I'm Ready!"}
            </button>

            {myReady && !opponentReady && (
              <p className="text-center text-slate-500 dark:text-slate-400 mt-4 animate-pulse">
                Waiting for opponent to be ready...
              </p>
            )}
            {myReady && opponentReady && (
              <p className="text-center text-green-600 dark:text-green-400 mt-4 font-semibold animate-pulse">
                Starting game...
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // PRIVATE ROOM SCREEN (with host controls)
  if (inRoom && !isQuickMatchRoom) {
    const opponent = players.find((p) => p.id !== playerId);
    const availableNumbers = getNumbersForOperation(operation);

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 transition-colors duration-300">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <button
              onClick={async () => {
                // Notify server so host gets player-left event
                if (roomId) {
                  await leaveRoom(roomId, playerId, playerName);
                }
                setInRoom(false);
                setRoomId(null);
                setPlayers([]);
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              ← Leave Room
            </button>
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              aria-label="Toggle dark mode"
            >
              {isDarkMode ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
            </button>
          </div>

          {/* Room Info Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white mb-4">
              {isHost ? "Your Room" : "Joined Room"}
            </h1>

            {/* Room Code */}
            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-4 mb-6">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Room Code</p>
                  <p className="text-3xl font-mono font-bold text-blue-600 dark:text-blue-400 tracking-widest">
                    {roomCode}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyToClipboard(roomCode)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                  >
                    Copy Code
                  </button>
                  {joinUrl && (
                    <button
                      onClick={() => copyToClipboard(joinUrl)}
                      className="px-4 py-2 bg-slate-600 text-white rounded-lg font-semibold hover:bg-slate-700 transition-colors"
                    >
                      Copy Link
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Players */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">Players</h2>
              <div className="grid grid-cols-2 gap-4">
                {players.map((player) => (
                  <div
                    key={player.id}
                    className={`p-4 rounded-xl border-2 ${
                      player.id === playerId
                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700"
                        : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          player.connected ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                      <span className="font-semibold text-slate-800 dark:text-white">
                        {player.name}
                        {player.id === playerId && " (You)"}
                      </span>
                    </div>
                    {player.isHost && (
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Host</span>
                    )}
                  </div>
                ))}
                {players.length < 2 && (
                  <div className="p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center">
                    <span className="text-slate-400 dark:text-slate-500">Waiting for opponent...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Game Settings (only host can edit) */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
              <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-4">Game Settings</h2>

              {/* Operation */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                  Operation
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {(Object.keys(operationLabels) as Operation[]).map((op) => (
                    <button
                      key={op}
                      onClick={() => {
                        if (!isHost) return;
                        setOperation(op);
                        const newNums = getNumbersForOperation(op);
                        setSelectedNumbers(newNums);
                        handleSettingsChange({ operation: op, selectedNumbers: newNums });
                      }}
                      disabled={!isHost}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        operation === op
                          ? "bg-blue-600 text-white"
                          : isHost
                          ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500 cursor-not-allowed"
                      }`}
                    >
                      {operationLabels[op]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Numbers */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Numbers</label>
                  {isHost && (
                    <div className="flex gap-2">
                      <button
                        onClick={selectAllNumbers}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Select All
                      </button>
                      <button
                        onClick={clearNumbers}
                        className="text-xs text-slate-500 dark:text-slate-400 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableNumbers.map((num) => (
                    <button
                      key={num}
                      onClick={() => isHost && toggleNumber(num)}
                      disabled={!isHost}
                      className={`w-10 h-10 rounded-lg font-semibold transition-colors ${
                        selectedNumbers.includes(num)
                          ? "bg-blue-600 text-white"
                          : isHost
                          ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500 cursor-not-allowed"
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question Count */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                  Number of Questions: {questionCount}
                </label>
                <input
                  type="range"
                  min="5"
                  max="30"
                  value={questionCount}
                  onChange={(e) => {
                    if (!isHost) return;
                    const val = parseInt(e.target.value);
                    setQuestionCount(val);
                    handleSettingsChange({ questionCount: val });
                  }}
                  disabled={!isHost}
                  className="w-full"
                />
              </div>

              {/* Time Limit */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                  Time Limit
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "30s", value: 30 },
                    { label: "1m", value: 60 },
                    { label: "2m", value: 120 },
                    { label: "5m", value: 300 },
                    { label: "None", value: 0 },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        if (!isHost) return;
                        setTimeLimit(opt.value);
                        handleSettingsChange({ timeLimit: opt.value });
                      }}
                      disabled={!isHost}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        timeLimit === opt.value
                          ? "bg-blue-600 text-white"
                          : isHost
                          ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500 cursor-not-allowed"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Button */}
              {isHost && (
                <button
                  onClick={handleStartGame}
                  disabled={players.length < 2 || isStarting}
                  className={`w-full py-4 rounded-xl text-xl font-bold transition-colors ${
                    players.length < 2 || isStarting
                      ? "bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-700"
                  }`}
                >
                  {isStarting ? "Starting..." : players.length < 2 ? "Waiting for Opponent..." : "Start Game"}
                </button>
              )}
              {!isHost && (
                <div className="text-center py-4 text-slate-500 dark:text-slate-400">
                  Waiting for host to start the game...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Searching for opponent
  if (isSearching) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-8 max-w-md w-full text-center">
          <div className="animate-spin w-16 h-16 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 rounded-full mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Searching for Opponent...</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">
            Looking for someone to play {operationLabels[quickMatchOperation]} with you
          </p>
          <button
            onClick={handleCancelSearch}
            className="px-6 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Main lobby tabs
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 transition-colors duration-300">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={() => navigate("/")}
            className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
          >
            ← Back to Menu
          </button>
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            aria-label="Toggle dark mode"
          >
            {isDarkMode ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
          </button>
        </div>

        {/* Main Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 md:p-8">
          <h1 className="text-3xl md:text-4xl font-bold text-center text-slate-800 dark:text-white mb-2">
            Multiplayer Mode
          </h1>
          <p className="text-center text-slate-500 dark:text-slate-400 mb-6">
            Challenge a friend or find a random opponent!
          </p>

          {/* Name Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.substring(0, 20))}
              placeholder="Enter your name"
              maxLength={20}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all outline-none"
            />
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
            {(["create", "join", "quickmatch"] as LobbyTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  activeTab === tab
                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {tab === "create" && "Create Room"}
                {tab === "join" && "Join Room"}
                {tab === "quickmatch" && "Quick Match"}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "create" && (
            <div className="text-center">
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                Create a private room and invite a friend to play.
              </p>
              <button
                onClick={handleCreateRoom}
                disabled={isCreating || !playerName.trim()}
                className={`w-full py-4 rounded-xl text-lg font-bold transition-colors ${
                  isCreating || !playerName.trim()
                    ? "bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {isCreating ? "Creating..." : "Create Room"}
              </button>
            </div>
          )}

          {activeTab === "join" && (
            <div>
              <p className="text-slate-600 dark:text-slate-400 mb-4 text-center">
                Enter the 8-character room code to join.
              </p>
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase().substring(0, 8))}
                placeholder="ABCD1234"
                maxLength={8}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-center text-2xl font-mono tracking-widest focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all outline-none mb-4"
              />
              {joinError && <p className="text-red-500 text-sm text-center mb-4">{joinError}</p>}
              <button
                onClick={handleJoinRoom}
                disabled={isJoining || !playerName.trim() || !joinCodeInput.trim()}
                className={`w-full py-4 rounded-xl text-lg font-bold transition-colors ${
                  isJoining || !playerName.trim() || !joinCodeInput.trim()
                    ? "bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {isJoining ? "Joining..." : "Join Room"}
              </button>
            </div>
          )}

          {activeTab === "quickmatch" && (
            <div>
              <p className="text-slate-600 dark:text-slate-400 mb-4 text-center">
                Select an operation and find a random opponent.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-6">
                {(Object.keys(operationLabels) as Operation[]).map((op) => (
                  <button
                    key={op}
                    onClick={() => setQuickMatchOperation(op)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      quickMatchOperation === op
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {operationLabels[op]}
                  </button>
                ))}
              </div>
              <button
                onClick={handleQuickMatch}
                disabled={!playerName.trim()}
                className={`w-full py-4 rounded-xl text-lg font-bold transition-colors ${
                  !playerName.trim()
                    ? "bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-purple-600 text-white hover:bg-purple-700"
                }`}
              >
                Find Opponent
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
