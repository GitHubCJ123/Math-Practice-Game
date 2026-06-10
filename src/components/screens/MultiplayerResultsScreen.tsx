import React, { useState, useEffect } from "react";
import type { Question, MultiplayerResult, Operation, Team, GameMode, TeamResult, AIDifficulty, RematchPayload } from "@shared/types";
import { CheckCircleIcon, XCircleIcon } from "../ui/icons";
import { Confetti } from "../ui/Confetti";
import { playWinSound } from "../../lib/audio";
import {
  getPusherClient,
  requestRematch,
  acceptRematch,
  declineRematch,
} from "../../lib/multiplayer";
import { formatPercentString } from "@shared/conversions";

interface MultiplayerResultsScreenProps {
  roomId: string;
  playerId: string;
  playerName: string;
  results: MultiplayerResult[];
  teams: Team[];
  gameMode: GameMode;
  teamResults?: TeamResult[];
  players?: { id: string; name: string; isAI?: boolean; aiDifficulty?: AIDifficulty }[];
  onRematch: (data: RematchPayload) => void;
  onPlayAgainAI?: () => void; // For AI games - return to AI mode tab
  onExit: () => void;
}

export const MultiplayerResultsScreen: React.FC<MultiplayerResultsScreenProps> = ({
  roomId,
  playerId,
  playerName,
  results,
  teams,
  gameMode,
  teamResults,
  players = [],
  onRematch,
  onPlayAgainAI,
  onExit,
}) => {
  const [rematchRequested, setRematchRequested] = useState(false);
  const [rematchPending, setRematchPending] = useState(false);
  const [rematchFromPlayer, setRematchFromPlayer] = useState<string | null>(null);
  const [rematchKeepTeams, setRematchKeepTeams] = useState(false);
  const [rematchDeclined, setRematchDeclined] = useState(false);
  const [declinedByPlayer, setDeclinedByPlayer] = useState<string | null>(null);
  const [rematchAcceptedCount, setRematchAcceptedCount] = useState(0);
  const [rematchTotalNeeded, setRematchTotalNeeded] = useState(0);
  const [iAccepted, setIAccepted] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  // Find our result - results are now sorted by rank
  const myResult = results.find((r) => r.playerId === playerId);
  const sortedResults = [...results].sort((a, b) => (a.rank || 1) - (b.rank || 1));
  
  // Determine my position
  const myRank = myResult?.rank || 1;
  const totalPlayers = results.length;
  
  // Team mode calculations - use team.playerIds for reliable matching
  const myTeam = teams.find((t) => t.playerIds.includes(playerId));
  const myTeamResult = teamResults?.find((tr) => tr.teamId === myTeam?.id);
  // Also check playerIds array in teamResults as fallback
  const myTeamResultFallback = teamResults?.find((tr) => tr.playerIds?.includes(playerId));
  const finalMyTeamResult = myTeamResult || myTeamResultFallback;
  const isTeamWinner = finalMyTeamResult?.isWinner || false;

  // AI game detection
  const isAIGame = players.some((p) => p.isAI);

  // Subscribe to room channel for rematch events
  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`room-${roomId}`);

    channel.bind(
      "rematch-requested",
      (data: { fromPlayerId: string; fromPlayerName: string; keepTeams?: boolean; totalNeeded: number }) => {
        setRematchTotalNeeded(data.totalNeeded);
        setRematchAcceptedCount(1); // Requester is already counted
        if (data.fromPlayerId !== playerId) {
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
      (data: { playerId: string; playerName: string; acceptedCount: number; totalNeeded: number }) => {
        setRematchAcceptedCount(data.acceptedCount);
        setRematchTotalNeeded(data.totalNeeded);
      }
    );

    channel.bind("rematch-accepted", (data: RematchPayload) => {
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
  }, [roomId, playerId, onRematch]);

  // Celebrate a win with confetti + fanfare on mount.
  useEffect(() => {
    const won = gameMode === 'teams' ? isTeamWinner : myRank === 1;
    if (won) {
      playWinSound();
      setCelebrate(true);
      const t = window.setTimeout(() => setCelebrate(false), 6500);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!myResult) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <p className="text-slate-500 font-display font-semibold">Loading results...</p>
      </div>
    );
  }

  const handleRequestRematch = async (keepTeams: boolean) => {
    setRematchRequested(true);
    setIAccepted(true);
    await requestRematch(roomId, playerId, playerName, keepTeams);
  };

  const handleAcceptRematch = async () => {
    setIAccepted(true);
    await acceptRematch(roomId, playerId, playerName, rematchKeepTeams);
  };

  const handleDeclineRematch = async () => {
    setRematchPending(false);
    await declineRematch(roomId, playerId, playerName);
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
        ? "bg-linear-to-r from-green-500 to-emerald-600"
        : "bg-linear-to-r from-red-500 to-rose-600";
    }
    switch (myRank) {
      case 1: return "bg-linear-to-r from-yellow-400 to-amber-500";
      case 2: return "bg-linear-to-r from-slate-400 to-slate-500";
      case 3: return "bg-linear-to-r from-amber-600 to-orange-700";
      default: return "bg-linear-to-r from-slate-500 to-slate-600";
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
    <div className="w-full p-2 sm:p-4 transition-colors duration-300">
      {celebrate && <Confetti />}
      <div className="w-full max-w-6xl mx-auto">
        {/* Result Banner */}
        <div className={`text-center py-5 px-6 rounded-3xl mb-6 shadow-xl animate-fade-in ${getResultBannerStyle()}`}>
          <h1 className="font-display text-3xl md:text-5xl font-bold text-white drop-shadow-sm">
            {getResultMessage()}
          </h1>
          {gameMode !== 'teams' && totalPlayers > 2 && (
            <p className="text-white/90 mt-1 font-semibold">{getRankEmoji(myRank)} {getRankLabel(myRank)} of {totalPlayers}</p>
          )}
        </div>

        {/* Rematch Request Popup */}
        {rematchPending && !iAccepted && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="game-panel p-8 max-w-md w-full animate-bounce-in">
              <h2 className="font-display text-2xl font-bold text-slate-800 dark:text-white mb-4 text-center">
                Rematch Challenge!
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-center mb-2">
                <span className="font-bold text-violet-600 dark:text-violet-400">
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
              <div className="flex gap-4 mt-4">
                <button
                  onClick={handleDeclineRematch}
                  className="btn3d btn3d--neutral flex-1 py-3 px-6 text-base"
                >
                  Decline
                </button>
                <button
                  onClick={handleAcceptRematch}
                  className="btn3d btn3d--success flex-1 py-3 px-6 text-base"
                >
                  Accept
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Waiting for others after accepting (3+ players) */}
        {iAccepted && rematchTotalNeeded > 2 && rematchAcceptedCount < rematchTotalNeeded && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="game-panel p-8 max-w-md w-full text-center animate-bounce-in">
              <div className="text-4xl mb-4 animate-float">⏳</div>
              <h2 className="font-display text-2xl font-bold text-slate-800 dark:text-white mb-4">
                Waiting for all players...
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                {rematchAcceptedCount}/{rematchTotalNeeded} players have accepted
              </p>
              <div className="progress-track h-3 mb-4">
                <div
                  className="progress-fill"
                  style={{ width: `${(rematchAcceptedCount / rematchTotalNeeded) * 100}%` }}
                />
              </div>
              <button
                onClick={handleDeclineRematch}
                className="btn3d btn3d--neutral py-3 px-6 text-base"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Declined notification */}
        {rematchDeclined && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-rose-500 to-red-600 text-white px-6 py-3 rounded-2xl shadow-lg z-50 font-semibold">
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
                      <span key={p.playerId} className="mr-3">
                        {p.playerName}: {p.score}/{p.totalQuestions}
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
            const isMe = result.playerId === playerId;
            const rank = result.rank || idx + 1;
            return (
              <div
                key={result.playerId}
                className={`game-panel p-4 ${
                  isMe
                    ? 'ring-2 ring-violet-400 dark:ring-violet-500'
                    : ''
                }`}
              >
                {/* Player Header */}
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getRankEmoji(rank)}</span>
                    <div>
                      <p className="font-display font-bold text-slate-800 dark:text-white">
                        {result.playerName}
                        {isMe && <span className="text-violet-600 dark:text-violet-400 text-xs ml-1">(You)</span>}
                      </p>
                      {gameMode === 'teams' && (
                        <p className="text-xs text-slate-500">
                          {teams.find(t => t.playerIds.includes(result.playerId))?.name || 'No Team'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl font-bold text-slate-700 dark:text-slate-200">
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
                            ? "bg-emerald-50 dark:bg-emerald-900/20"
                            : "bg-rose-50 dark:bg-rose-900/20"
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          {isCorrect ? (
                            <CheckCircleIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <XCircleIcon className="w-4 h-4 text-rose-500 shrink-0" />
                          )}
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            {formatQuestion(q)} = {q.answer}
                          </span>
                        </div>
                        <span
                          className={`font-mono font-bold ${
                            isCorrect ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
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
                className="btn3d btn3d--success px-10 py-4 text-lg"
              >
                🤖 Play Again vs AI
              </button>
            </>
          ) : gameMode === 'teams' ? (
            <>
              <button
                onClick={() => handleRequestRematch(true)}
                disabled={rematchRequested || iAccepted}
                className="btn3d btn3d--primary px-8 py-4 text-lg"
              >
                {rematchRequested || iAccepted
                  ? (totalPlayers > 2 ? `Waiting (${rematchAcceptedCount}/${rematchTotalNeeded})...` : "Waiting...")
                  : "Rematch (Same Teams)"}
              </button>
              <button
                onClick={() => handleRequestRematch(false)}
                disabled={rematchRequested || iAccepted}
                className="btn3d btn3d--fuchsia px-8 py-4 text-lg"
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
              className="btn3d btn3d--fuchsia px-10 py-4 text-lg"
            >
              {rematchRequested || iAccepted
                ? (totalPlayers > 2 ? `Waiting (${rematchAcceptedCount}/${rematchTotalNeeded})...` : "Waiting...")
                : "Request Rematch"}
            </button>
          )}
          <button
            onClick={onExit}
            className="btn3d btn3d--neutral px-10 py-4 text-lg"
          >
            Back to Menu
          </button>
        </div>
      </div>
    </div>
  );
};
