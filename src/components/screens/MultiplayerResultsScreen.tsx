import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Pusher, { Channel } from "pusher-js";
import type { Question, MultiplayerResult, Operation } from "../../../types";
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
  onRematch: (data: { newRoomId: string; newRoomCode: string; isQuickMatch: boolean; players: any[]; settings: any }) => void;
  onExit: () => void;
}

export const MultiplayerResultsScreen: React.FC<MultiplayerResultsScreenProps> = ({
  roomId,
  odId,
  odName,
  results,
  onRematch,
  onExit,
}) => {
  const navigate = useNavigate();
  const [rematchRequested, setRematchRequested] = useState(false);
  const [rematchPending, setRematchPending] = useState(false);
  const [rematchFromPlayer, setRematchFromPlayer] = useState<string | null>(null);
  const [rematchDeclined, setRematchDeclined] = useState(false);

  // Find our result and opponent result
  const myResult = results.find((r) => r.odId === odId);
  const opponentResult = results.find((r) => r.odId !== odId);

  // Determine winner: Score first, then time
  const iWin = myResult && opponentResult ? (
    myResult.score > opponentResult.score ||
    (myResult.score === opponentResult.score && myResult.timeTaken < opponentResult.timeTaken)
  ) : false;
  const isDraw = myResult && opponentResult ? (
    myResult.score === opponentResult.score && myResult.timeTaken === opponentResult.timeTaken
  ) : false;

  // Subscribe to room channel for rematch events
  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`room-${roomId}`);

    channel.bind(
      "rematch-requested",
      (data: { fromPlayerId: string; fromPlayerName: string }) => {
        if (data.fromPlayerId !== odId) {
          setRematchPending(true);
          setRematchFromPlayer(data.fromPlayerName);
        }
      }
    );

    channel.bind("rematch-accepted", (data: { newRoomId: string; newRoomCode: string; isQuickMatch: boolean; players: any[]; settings: any }) => {
      onRematch(data);
    });

    channel.bind("rematch-declined", () => {
      setRematchRequested(false);
      setRematchDeclined(true);
      setTimeout(() => setRematchDeclined(false), 3000);
    });

    return () => {
      pusher.unsubscribe(`room-${roomId}`);
    };
  }, [roomId, odId, onRematch]);

  if (!myResult || !opponentResult) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500">Loading results...</p>
      </div>
    );
  }

  const handleRequestRematch = async () => {
    setRematchRequested(true);
    await requestRematch(roomId, odId, odName);
  };

  const handleAcceptRematch = async () => {
    await acceptRematch(roomId, odId, odName);
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

  const questions = myResult.questions;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 transition-colors duration-300 flex flex-col justify-center">
      <div className="w-full max-w-[95%] mx-auto flex flex-col">
        {/* Winner Banner - compact */}
        <div
          className={`text-center py-4 px-6 rounded-2xl mb-4 ${
            isDraw
              ? "bg-slate-200 dark:bg-slate-800"
              : iWin
              ? "bg-gradient-to-r from-green-500 to-emerald-600"
              : "bg-gradient-to-r from-red-500 to-rose-600"
          }`}
        >
          <h1
            className={`text-4xl md:text-5xl font-extrabold ${
              isDraw ? "text-slate-700 dark:text-slate-200" : "text-white"
            }`}
          >
            {isDraw ? "It's a Draw!" : iWin ? "You Won!" : "You Lost!"}
          </h1>
        </div>

        {/* Rematch Request Popup */}
        {rematchPending && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-4 text-center">
                Rematch Challenge!
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-center mb-6">
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {rematchFromPlayer}
                </span>{" "}
                wants a rematch. Do you accept?
              </p>
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

        {/* Declined notification */}
        {rematchDeclined && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-xl shadow-lg z-50">
            Rematch declined by opponent
          </div>
        )}

        {/* Score Comparison - Full width */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Your Score */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border-4 border-blue-500 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">You ({odName})</h2>
              <span className="text-4xl font-extrabold text-blue-600 dark:text-blue-400">
                {myResult.score}/{myResult.totalQuestions}
              </span>
            </div>
            <p className="text-lg text-slate-500 dark:text-slate-400 mb-4 font-medium">
              Time: <span className="font-bold text-xl text-slate-700 dark:text-slate-300">{formatTime(myResult.timeTaken)}</span>
            </p>

            {/* Question breakdown - Grid layout to fill space */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {questions.map((q, i) => {
                const isCorrect = checkAnswer(q, myResult.answers[i]);
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between py-4 px-5 rounded-xl ${
                      isCorrect
                        ? "bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isCorrect ? (
                        <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircleIcon className="w-6 h-6 text-red-500 flex-shrink-0" />
                      )}
                      <span className="text-lg font-bold text-slate-700 dark:text-slate-200">
                        {formatQuestion(q)} = {q.answer}
                      </span>
                    </div>
                    <span
                      className={`text-lg font-mono font-bold ${
                        isCorrect
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {myResult.answers[i] || "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Opponent Score */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border-2 border-slate-200 dark:border-slate-700 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                {opponentResult.odName}
              </h2>
              <span className="text-4xl font-extrabold text-slate-600 dark:text-slate-400">
                {opponentResult.score}/{opponentResult.totalQuestions}
              </span>
            </div>
            <p className="text-lg text-slate-500 dark:text-slate-400 mb-4 font-medium">
              Time: <span className="font-bold text-xl text-slate-700 dark:text-slate-300">{formatTime(opponentResult.timeTaken)}</span>
            </p>

            {/* Question breakdown - Grid layout to fill space */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {questions.map((q, i) => {
                const isCorrect = checkAnswer(q, opponentResult.answers[i]);
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between py-4 px-5 rounded-xl ${
                      isCorrect
                        ? "bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isCorrect ? (
                        <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircleIcon className="w-6 h-6 text-red-500 flex-shrink-0" />
                      )}
                      <span className="text-lg font-bold text-slate-700 dark:text-slate-200">
                        {formatQuestion(q)} = {q.answer}
                      </span>
                    </div>
                    <span
                      className={`text-lg font-mono font-bold ${
                        isCorrect
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {opponentResult.answers[i] || "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={handleRequestRematch}
            disabled={rematchRequested}
            className={`px-10 py-4 rounded-xl text-lg font-bold transition-all transform hover:scale-105 ${
              rematchRequested
                ? "bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed"
                : "bg-purple-600 text-white hover:bg-purple-700 shadow-lg"
            }`}
          >
            {rematchRequested ? "Waiting for opponent..." : "Request Rematch"}
          </button>
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
