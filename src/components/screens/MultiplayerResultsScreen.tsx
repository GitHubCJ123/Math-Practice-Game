import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Pusher, { Channel } from "pusher-js";
import type { Question, MultiplayerResult, Operation, Team, GameMode, TeamResult, AIDifficulty } from "../../../types";
import { CheckCircleIcon, XCircleIcon, TrophyIcon } from "../ui/icons";
import {
  getPusherClient,
  requestRematch,
  acceptRematch,
  declineRematch,
  getOrCreatePlayerId,
} from "../../lib/multiplayer";
import { formatPercentString } from "../../lib/conversions";

interface MultiplayerResultsScreenProps {
  roomId: string;
  odId: string;
  odName: string;
  results: MultiplayerResult[];
  teams: Team[];
  gameMode: GameMode;
  teamResults?: TeamResult[];
  players?: { id: string; name: string; isAI?: boolean; aiDifficulty?: AIDifficulty }[];
  onRematch: (data: { newRoomId: string; newRoomCode: string; isQuickMatch: boolean; players: any[]; settings: any; teams: Team[] }) => void;
  onPlayAgainAI?: () => void; // For AI games - return to AI mode tab
  onExit: () => void;
}

export const MultiplayerResultsScreen: React.FC<MultiplayerResultsScreenProps> = ({
  roomId,
  odId,
  odName,
  results,
  teams,
  gameMode,
  teamResults,
  players = [],
  onRematch,
  onPlayAgainAI,
  onExit,
}) => {
  const navigate = useNavigate();
  const [rematchRequested, setRematchRequested] = useState(false);
  const [rematchPending, setRematchPending] = useState(false);
  const [rematchFromPlayer, setRematchFromPlayer] = useState<string | null>(null);
  const [rematchKeepTeams, setRematchKeepTeams] = useState(false);
  const [rematchDeclined, setRematchDeclined] = useState(false);
  const [declinedByPlayer, setDeclinedByPlayer] = useState<string | null>(null);
  const [rematchAcceptedCount, setRematchAcceptedCount] = useState(0);
  const [rematchTotalNeeded, setRematchTotalNeeded] = useState(0);
  const [iAccepted, setIAccepted] = useState(false);

  // Find our result - results are now sorted by rank
  const myResult = results.find((r) => r.odId === odId);
  const sortedResults = [...results].sort((a, b) => (a.rank || 1) - (b.rank || 1));
  
  // Determine my position
  const myRank = myResult?.rank || 1;
  const iWin = myRank === 1;
  const totalPlayers = results.length;
  
  // Team mode calculations - use team.playerIds for reliable matching
  const myTeam = teams.find((t) => t.playerIds.includes(odId));
  const myTeamResult = teamResults?.find((tr) => tr.teamId === myTeam?.id);
  // Also check playerIds array in teamResults as fallback
  const myTeamResultFallback = teamResults?.find((tr) => tr.playerIds?.includes(odId));
  const finalMyTeamResult = myTeamResult || myTeamResultFallback;
  const isTeamWinner = finalMyTeamResult?.isWinner || false;

  // AI game detection
  const isAIGame = players.some((p) => p.isAI);
  const aiOpponent = players.find((p) => p.isAI);

  // Subscribe to room channel for rematch events
  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`room-${roomId}`);

    channel.bind(
      "rematch-requested",
      (data: { fromPlayerId: string; fromPlayerName: string; keepTeams?: boolean; totalNeeded: number }) => {
        setRematchTotalNeeded(data.totalNeeded);
        setRematchAcceptedCount(1); // Requester is already counted
        if (data.fromPlayerId !== odId) {
          setRematchPending(true);
          setRematchFromPlayer(data.fromPlayerName);
          setRematchKeepTeams(data.keepTeams || false);
        } else {
          // I'm the requester
          setRematchRequested(true);
          setIAccepted(true);
        }
      }
    );

    channel.bind(
      "rematch-player-accepted",
      (data: { odId: string; odName: string; acceptedCount: number; totalNeeded: number }) => {
        setRematchAcceptedCount(data.acceptedCount);
        setRematchTotalNeeded(data.totalNeeded);
      }
    );

    channel.bind("rematch-accepted", (data: { newRoomId: string; newRoomCode: string; isQuickMatch: boolean; players: any[]; settings: any; teams: Team[] }) => {
      onRematch(data);
    });

    channel.bind("rematch-declined", (data: { declinedBy?: string }) => {
      setRematchRequested(false);
      setRematchPending(false);
      setIAccepted(false);
      setRematchAcceptedCount(0);
      setRematchDeclined(true);
      setDeclinedByPlayer(data.declinedBy || null);
      setTimeout(() => {
        setRematchDeclined(false);
        setDeclinedByPlayer(null);
      }, 3000);
    });

    return () => {
      pusher.unsubscribe(`room-${roomId}`);
    };
  }, [roomId, odId, onRematch]);

  if (!myResult) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500">Loading results...</p>
      </div>
    );
  }

  const handleRequestRematch = async (keepTeams: boolean) => {
    setRematchRequested(true);
    setIAccepted(true);
    await requestRematch(roomId, odId, odName, keepTeams);
  };

  const handleAcceptRematch = async () => {
    setIAccepted(true);
    await acceptRematch(roomId, odId, odName, rematchKeepTeams);
  };

  const handleDeclineRematch = async () => {
    setRematchPending(false);
    await declineRematch(roomId, odId, odName);
  };

  const formatTime = (ms: number) => {
    const seconds = ms / 1000;
    if (seconds < 60) {
      return `${seconds.toFixed(2)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(1);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const normalizePercentAnswer = (value: string) => {
    const trimmed = value.trim();
    const numericPart = trimmed.replace(/[^0-9.]/g, "");
    if (!numericPart) return trimmed;
    const numericValue = parseFloat(numericPart);
    if (Number.isNaN(numericValue)) return trimmed;
    return formatPercentString(numericValue / 100);
  };

  const normalizeAnswerForComparison = (value: string | number, question: Question) => {
    const strValue = String(value ?? "").trim();
    if (!strValue) return "";
    if (question.operation === "fraction-to-decimal") {
      return strValue.startsWith(".") ? `0${strValue}` : strValue;
    }
    if (question.operation === "fraction-to-percent") {
      return normalizePercentAnswer(strValue);
    }
    return strValue;
  };

  const checkAnswer = (question: Question, userAnswer: string) => {
    const expectedAnswer = normalizeAnswerForComparison(question.answer, question);
    const normalizedUserAnswer = normalizeAnswerForComparison(userAnswer ?? "", question);
    return normalizedUserAnswer === expectedAnswer;
  };

  const getOperationSymbol = (op: Operation) => {
    switch (op) {
      case "multiplication": return "×";
      case "division": return "÷";
      case "squares": return "²";
      case "square-roots": return "√";
      case "negative-numbers": return "±";
      default: return "?";
    }
  };

  const formatQuestion = (q: Question) => {
    if (q.display) return q.display;
    if (q.operation === "squares") return `${q.num1}²`;
    if (q.operation === "square-roots") return `√${q.num1}`;
    return `${q.num1} ${getOperationSymbol(q.operation)} ${q.num2}`;
  };

  const getRankEmoji = (rank: number) => {
    switch (rank) {
      case 1: return "🥇";
      case 2: return "🥈";
      case 3: return "🥉";
      default: return "4️⃣";
    }
  };

  const getRankLabel = (rank: number) => {
    switch (rank) {
      case 1: return "1st";
      case 2: return "2nd";
      case 3: return "3rd";
      default: return `${rank}th`;
    }
  };

  const getResultBannerStyle = () => {
    if (gameMode === 'teams') {
      return isTeamWinner
        ? "bg-gradient-to-r from-green-500 to-emerald-600"
        : "bg-gradient-to-r from-red-500 to-rose-600";
    }
    switch (myRank) {
      case 1: return "bg-gradient-to-r from-yellow-400 to-amber-500";
      case 2: return "bg-gradient-to-r from-slate-400 to-slate-500";
      case 3: return "bg-gradient-to-r from-amber-600 to-orange-700";
      default: return "bg-gradient-to-r from-slate-500 to-slate-600";
    }
  };

  const getResultMessage = () => {
    if (gameMode === 'teams') {
      return isTeamWinner ? "Your Team Won!" : "Your Team Lost!";
    }
    switch (myRank) {
      case 1: return "🏆 You Won!";
      case 2: return "Great job! 2nd Place!";
      case 3: return "Nice! 3rd Place!";
      default: return "Better luck next time!";
    }
  };

  const questions = myResult.questions;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 transition-colors duration-300">
      <div className="w-full max-w-6xl mx-auto">
        {/* Result Banner */}
        <div className={`text-center py-4 px-6 rounded-2xl mb-6 ${getResultBannerStyle()}`}>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white">
            {getResultMessage()}
          </h1>
          {gameMode !== 'teams' && totalPlayers > 2 && (
            <p className="text-white/80 mt-1">{getRankEmoji(myRank)} {getRankLabel(myRank)} of {totalPlayers}</p>
          )}
        </div>

        {/* Rematch Request Popup */}
        {rematchPending && !iAccepted && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-4 text-center">
                Rematch Challenge!
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-center mb-2">
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {rematchFromPlayer}
                </span>{" "}
                wants a rematch.
              </p>
              {gameMode === 'teams' && (
                <p className="text-sm text-slate-500 text-center mb-2">
                  {rematchKeepTeams ? "Same teams" : "Shuffled teams"}
                </p>
              )}
              {totalPlayers > 2 && (
                <p className="text-sm text-slate-500 text-center mb-4">
                  All players must accept ({rematchAcceptedCount}/{rematchTotalNeeded})
                </p>
              )}
              <div className="flex gap-4">
                <button
                  onClick={handleDeclineRematch}
                  className="flex-1 py-3 px-6 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                >
                  Decline
                </button>
                <button
                  onClick={handleAcceptRematch}
                  className="flex-1 py-3 px-6 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors"
                >
                  Accept
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Waiting for others after accepting (3+ players) */}
        {iAccepted && rematchTotalNeeded > 2 && rematchAcceptedCount < rematchTotalNeeded && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl text-center">
              <div className="text-4xl mb-4">⏳</div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">
                Waiting for all players...
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                {rematchAcceptedCount}/{rematchTotalNeeded} players have accepted
              </p>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 mb-4">
                <div 
                  className="bg-green-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${(rematchAcceptedCount / rematchTotalNeeded) * 100}%` }}
                />
              </div>
              <button
                onClick={handleDeclineRematch}
                className="py-3 px-6 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Declined notification */}
        {rematchDeclined && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-xl shadow-lg z-50">
            {declinedByPlayer ? `${declinedByPlayer} declined the rematch` : "Rematch declined"}
          </div>
        )}

        {/* Team Results Summary (Team Mode) */}
        {gameMode === 'teams' && teamResults && teamResults.length === 2 && (
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {teamResults.map((tr, idx) => {
              const team = teams.find(t => t.id === tr.teamId);
              const teamPlayers = results.filter(r => r.teamId === tr.teamId);
              const isMyTeam = tr.teamId === myTeam?.id;
              return (
                <div
                  key={tr.teamId}
                  className={`rounded-2xl p-4 border-2 ${
                    tr.isWinner
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-400'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className={`text-lg font-bold ${
                      idx === 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {idx === 0 ? '🔵' : '🔴'} {team?.name || `Team ${idx + 1}`}
                      {isMyTeam && <span className="text-xs ml-2 text-slate-500">(Your Team)</span>}
                      {tr.isWinner && <span className="ml-2">🏆</span>}
                    </h3>
                    <span className="text-2xl font-extrabold text-slate-700 dark:text-slate-200">
                      {tr.averageScore.toFixed(1)} avg
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Avg Time: {formatTime(tr.averageTime)}
                  </p>
                  <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    {teamPlayers.map(p => (
                      <span key={p.odId} className="mr-3">
                        {p.odName}: {p.score}/{p.totalQuestions}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* All Players Results - Show everyone's answers */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {sortedResults.map((result, idx) => {
            const isMe = result.odId === odId;
            const rank = result.rank || idx + 1;
            return (
              <div
                key={result.odId}
                className={`bg-white dark:bg-slate-900 rounded-2xl shadow-lg border-2 p-4 ${
                  isMe
                    ? 'border-blue-400 dark:border-blue-500'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {/* Player Header */}
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getRankEmoji(rank)}</span>
                    <div>
                      <p className="font-bold text-slate-800 dark:text-white">
                        {result.odName}
                        {isMe && <span className="text-blue-600 dark:text-blue-400 text-xs ml-1">(You)</span>}
                      </p>
                      {gameMode === 'teams' && (
                        <p className="text-xs text-slate-500">
                          {teams.find(t => t.playerIds.includes(result.odId))?.name || 'No Team'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-extrabold text-slate-700 dark:text-slate-200">
                      {result.score}/{result.totalQuestions}
                    </p>
                    <p className="text-xs text-slate-500">{formatTime(result.timeTaken)}</p>
                  </div>
                </div>

                {/* Answers Grid - 2 columns within each card */}
                <div className="grid grid-cols-2 gap-2">
                  {questions.map((q, i) => {
                    const isCorrect = checkAnswer(q, result.answers[i]);
                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-between py-2 px-3 rounded-lg text-sm ${
                          isCorrect
                            ? "bg-green-50 dark:bg-green-900/20"
                            : "bg-red-50 dark:bg-red-900/20"
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          {isCorrect ? (
                            <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
                          )}
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            {formatQuestion(q)} = {q.answer}
                          </span>
                        </div>
                        <span
                          className={`font-mono font-bold ${
                            isCorrect ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {result.answers[i] || "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {isAIGame ? (
            /* AI Game - Show Play Again button */
            <>
              <button
                onClick={onPlayAgainAI}
                className="px-10 py-4 rounded-xl text-lg font-bold transition-all transform hover:scale-105 bg-green-600 text-white hover:bg-green-700 shadow-lg"
              >
                🤖 Play Again vs AI
              </button>
              <button
                onClick={onExit}
                className="px-10 py-4 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-lg font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all transform hover:scale-105 shadow-lg"
              >
                Back to Menu
              </button>
            </>
          ) : gameMode === 'teams' ? (
            <>
              <button
                onClick={() => handleRequestRematch(true)}
                disabled={rematchRequested || iAccepted}
                className={`px-8 py-4 rounded-xl text-lg font-bold transition-all transform hover:scale-105 ${
                  rematchRequested || iAccepted
                    ? "bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg"
                }`}
              >
                {rematchRequested || iAccepted 
                  ? (totalPlayers > 2 ? `Waiting (${rematchAcceptedCount}/${rematchTotalNeeded})...` : "Waiting...")
                  : "Rematch (Same Teams)"}
              </button>
              <button
                onClick={() => handleRequestRematch(false)}
                disabled={rematchRequested || iAccepted}
                className={`px-8 py-4 rounded-xl text-lg font-bold transition-all transform hover:scale-105 ${
                  rematchRequested || iAccepted
                    ? "bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-purple-600 text-white hover:bg-purple-700 shadow-lg"
                }`}
              >
                {rematchRequested || iAccepted
                  ? (totalPlayers > 2 ? `Waiting (${rematchAcceptedCount}/${rematchTotalNeeded})...` : "Waiting...")
                  : "Rematch (Shuffle Teams)"}
              </button>
            </>
          ) : (
            <button
              onClick={() => handleRequestRematch(false)}
              disabled={rematchRequested || iAccepted}
              className={`px-10 py-4 rounded-xl text-lg font-bold transition-all transform hover:scale-105 ${
                rematchRequested || iAccepted
                  ? "bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed"
                  : "bg-purple-600 text-white hover:bg-purple-700 shadow-lg"
              }`}
            >
              {rematchRequested || iAccepted
                ? (totalPlayers > 2 ? `Waiting (${rematchAcceptedCount}/${rematchTotalNeeded})...` : "Waiting...")
                : "Request Rematch"}
            </button>
          )}
          <button
            onClick={onExit}
            className="px-10 py-4 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-lg font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all transform hover:scale-105 shadow-lg"
          >
            Back to Menu
          </button>
        </div>
      </div>
    </div>
  );
};
