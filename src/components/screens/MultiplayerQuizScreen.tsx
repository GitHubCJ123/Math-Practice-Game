import React, { useState, useEffect, useRef } from "react";
import Pusher, { Channel } from "pusher-js";
import type { Question, Operation, MultiplayerResult, Team, GameMode, Player, TeamResult, AIDifficulty } from "../../../types";
import { ClockIcon } from "../ui/icons";
import {
  getPusherClient,
  updateProgress,
  submitMultiplayerAnswers,
  notifyDisconnect,
} from "../../lib/multiplayer";

// AI difficulty profiles for client-side simulation
const AI_PROFILES: Record<AIDifficulty, { accuracy: number; minTime: number; maxTime: number }> = {
  easy: { accuracy: 0.75, minTime: 4000, maxTime: 6000 },
  medium: { accuracy: 0.85, minTime: 2000, maxTime: 4000 },
  hard: { accuracy: 0.95, minTime: 1000, maxTime: 2000 },
  expert: { accuracy: 1.0, minTime: 500, maxTime: 1000 },
};

// Simulate AI game results - respects both time limit AND actual elapsed time
function simulateAIResults(
  difficulty: AIDifficulty,
  questions: Question[],
  aiPlayer: Player,
  timeLimitMs: number, // 0 means no limit
  elapsedMs: number // How long the game actually took (human's time)
): MultiplayerResult {
  const profile = AI_PROFILES[difficulty];
  const answers: string[] = [];
  let cumulativeTime = 0;
  let score = 0;
  
  // AI can only work within the actual elapsed time (when human finished/time ran out)
  // Also respect time limit if set
  const effectiveTimeLimit = timeLimitMs > 0 ? Math.min(timeLimitMs, elapsedMs) : elapsedMs;

  for (const question of questions) {
    const questionTime = Math.random() * (profile.maxTime - profile.minTime) + profile.minTime;
    cumulativeTime += questionTime;

    // If AI ran out of time (either game ended or AI is too slow), leave unanswered
    if (cumulativeTime > effectiveTimeLimit) {
      answers.push(""); // Unanswered - same as human not answering
      continue;
    }

    const isCorrect = Math.random() < profile.accuracy;
    if (isCorrect) {
      answers.push(String(question.answer));
      score++;
    } else {
      // Generate a wrong answer
      const correctAnswer = question.answer;
      if (typeof correctAnswer === "number") {
        const offset = Math.floor(Math.random() * 3) + 1;
        const direction = Math.random() < 0.5 ? -1 : 1;
        answers.push(String(correctAnswer + offset * direction));
      } else {
        answers.push("0.5"); // Default wrong answer for string types
      }
    }
  }

  // AI's time taken is the cumulative time (but capped at effective limit)
  const aiTimeTaken = Math.min(cumulativeTime, effectiveTimeLimit);

  return {
    odId: aiPlayer.id,
    odName: aiPlayer.name,
    score,
    totalQuestions: questions.length,
    timeTaken: aiTimeTaken,
    answers,
    questions,
    rank: 0, // Will be calculated later
  };
}

interface MultiplayerQuizScreenProps {
  roomId: string;
  odId: string;
  odName: string;
  questions: Question[];
  timeLimit: number;
  players: Player[];
  teams: Team[];
  gameMode: GameMode;
  onFinish: (results: MultiplayerResult[], teamResults?: TeamResult[]) => void;
}

const playTimeUpSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.3);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.error("Could not play sound:", error);
  }
};

export const MultiplayerQuizScreen: React.FC<MultiplayerQuizScreenProps> = ({
  roomId,
  odId,
  odName,
  questions,
  timeLimit,
  players,
  teams,
  gameMode,
  onFinish,
}) => {
  const [answers, setAnswers] = useState<string[]>(Array(questions.length).fill(""));
  const [elapsedTime, setElapsedTime] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [introStage, setIntroStage] = useState<"ready" | "set" | "go" | "finished">("ready");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timerStartRef = useRef<number | null>(null);

  // Opponent state - now tracks multiple opponents
  const [opponentProgress, setOpponentProgress] = useState<Record<string, number>>({});
  const [opponentFinished, setOpponentFinished] = useState<Record<string, boolean>>({});
  const [showFinishedPopup, setShowFinishedPopup] = useState<string | null>(null);
  const [waitingForOpponents, setWaitingForOpponents] = useState(false);
  const [disconnectedPlayers, setDisconnectedPlayers] = useState<Set<string>>(new Set());
  
  // Derived values
  const opponents = players.filter((p) => p.id !== odId);
  const aiOpponent = opponents.find((p) => p.isAI);
  const isAIGame = !!aiOpponent;
  const myTeam = teams.find((t) => t.playerIds.includes(odId));
  const myTeammates = myTeam ? players.filter((p) => myTeam.playerIds.includes(p.id) && p.id !== odId) : [];
  const myOpponents = gameMode === 'teams' 
    ? players.filter((p) => !myTeam?.playerIds.includes(p.id))
    : opponents;
  const allOpponentsFinished = opponents.every((p) => opponentFinished[p.id] || disconnectedPlayers.has(p.id) || p.isAI);

  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const lastProgressRef = useRef(0);
  const gameStartTimeRef = useRef<number | null>(null);

  // Set the game start time when intro finishes
  useEffect(() => {
    if (introStage === "finished" && gameStartTimeRef.current === null) {
      gameStartTimeRef.current = Date.now();
    }
  }, [introStage]);

  // Simulate AI progress during the game
  useEffect(() => {
    if (!isAIGame || !aiOpponent || introStage !== "finished" || quizFinished) return;
    if (gameStartTimeRef.current === null) return;

    const difficulty = aiOpponent.aiDifficulty || "medium";
    const profile = AI_PROFILES[difficulty];
    const avgTimePerQuestion = (profile.minTime + profile.maxTime) / 2;
    const timeLimitMs = timeLimit > 0 ? timeLimit * 1000 : Infinity;

    // Initialize AI progress to 0
    setOpponentProgress((prev) => ({
      ...prev,
      [aiOpponent.id]: prev[aiOpponent.id] ?? 0,
    }));

    const intervalId = setInterval(() => {
      if (gameStartTimeRef.current === null) return;
      
      const elapsed = Date.now() - gameStartTimeRef.current;
      
      // If time limit reached, AI stops where it is
      if (timeLimit > 0 && elapsed >= timeLimitMs) {
        clearInterval(intervalId);
        return;
      }

      const estimatedProgress = Math.min(
        Math.floor(elapsed / avgTimePerQuestion),
        questions.length
      );

      setOpponentProgress((prev) => ({
        ...prev,
        [aiOpponent.id]: estimatedProgress,
      }));

      // AI finishes when it reaches all questions (and time hasn't run out)
      if (estimatedProgress >= questions.length && !opponentFinished[aiOpponent.id]) {
        setOpponentFinished((prev) => ({ ...prev, [aiOpponent.id]: true }));
        setShowFinishedPopup(aiOpponent.name);
        setTimeout(() => setShowFinishedPopup(null), 2000);
      }
    }, 500);

    return () => clearInterval(intervalId);
  }, [isAIGame, aiOpponent, introStage, quizFinished, questions.length, opponentFinished, timeLimit]);

  // Subscribe to room channel for opponent events
  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`room-${roomId}`);

    channel.bind("opponent-progress", (data: { odId: string; currentQuestion: number }) => {
      if (data.odId !== odId) {
        setOpponentProgress((prev) => ({ ...prev, [data.odId]: data.currentQuestion }));
      }
    });

    channel.bind("opponent-finished", (data: { odId: string; finishTime: number }) => {
      if (data.odId !== odId) {
        setOpponentFinished((prev) => ({ ...prev, [data.odId]: true }));
        if (!quizFinished) {
          const finishedPlayer = players.find((p) => p.id === data.odId);
          setShowFinishedPopup(finishedPlayer?.name || "Someone");
          setTimeout(() => setShowFinishedPopup(null), 2000);
        }
      }
    });

    channel.bind("game-ended", (data: { results: MultiplayerResult[]; teamResults?: TeamResult[] }) => {
      onFinish(data.results, data.teamResults);
    });

    channel.bind("player-disconnected", (data: { odId: string }) => {
      if (data.odId !== odId) {
        setDisconnectedPlayers((prev) => new Set([...prev, data.odId]));
        setOpponentFinished((prev) => ({ ...prev, [data.odId]: true }));
      }
    });

    // Notify server on page unload
    const handleBeforeUnload = () => {
      notifyDisconnect(roomId, odId);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      pusher.unsubscribe(`room-${roomId}`);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [roomId, odId, onFinish, quizFinished, players]);

  // Intro animation
  useEffect(() => {
    if (introStage === "ready") {
      setTimeout(() => setIntroStage("set"), 1000);
    } else if (introStage === "set") {
      setTimeout(() => setIntroStage("go"), 1000);
    } else if (introStage === "go") {
      setTimeout(() => {
        setIntroStage("finished");
        setTimerRunning(true);
      }, 1000);
    }
  }, [introStage]);

  useEffect(() => {
    if (introStage === "finished" && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [introStage]);

  // Timer — uses wall-clock time for accurate timing regardless of device performance
  useEffect(() => {
    if (!timerRunning) return;
    if (timerStartRef.current === null) {
      timerStartRef.current = performance.now();
    }
    const startTime = timerStartRef.current;
    const intervalId = setInterval(() => {
      const newElapsedTime = (performance.now() - startTime) / 1000;
      if (timeLimit > 0 && newElapsedTime >= timeLimit) {
        clearInterval(intervalId);
        setTimerRunning(false);
        setElapsedTime(timeLimit);
        playTimeUpSound();
        setTimeout(() => {
          if (!quizFinished) {
            handleSubmitQuiz(answersRef.current, timeLimit);
          }
        }, 300);
      } else {
        setElapsedTime(newElapsedTime);
      }
    }, 10);
    return () => clearInterval(intervalId);
  }, [timerRunning, timeLimit]);

  // Visibility change handler (anti-cheat)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && timerRunning && !quizFinished) {
        handleSubmitQuiz(answersRef.current, elapsedTime);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [timerRunning, elapsedTime, quizFinished]);

  const calculateScore = (userAnswers: string[]): number => {
    return questions.reduce((score, q, i) => {
      const userAnswer = userAnswers[i]?.trim();
      const correctAnswer = String(q.answer);
      if (userAnswer === correctAnswer) return score + 1;
      // Handle percent answers
      if (q.operation === "fraction-to-percent" && userAnswer === correctAnswer.replace("%", "")) {
        return score + 1;
      }
      return score;
    }, 0);
  };

  const handleSubmitQuiz = async (finalAnswers: string[], finalTime: number) => {
    if (quizFinished) return;
    setQuizFinished(true);
    setTimerRunning(false);

    const score = calculateScore(finalAnswers);

    // For AI games, calculate results locally
    if (isAIGame && aiOpponent) {
      const difficulty = aiOpponent.aiDifficulty || "medium";
      
      // Create my result
      const myResult: MultiplayerResult = {
        odId,
        odName,
        score,
        totalQuestions: questions.length,
        timeTaken: finalTime * 1000, // Convert to ms
        answers: finalAnswers,
        questions,
        rank: 0,
      };

      // Simulate AI result - pass time limit (converted to ms) and elapsed time
      const timeLimitMs = timeLimit > 0 ? timeLimit * 1000 : 0;
      const elapsedMs = finalTime * 1000;
      const aiResult = simulateAIResults(difficulty, questions, aiOpponent, timeLimitMs, elapsedMs);

      // Determine rankings
      const allResults = [myResult, aiResult].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.timeTaken - b.timeTaken;
      });

      allResults.forEach((r, idx) => {
        r.rank = idx + 1;
      });

      // Call onFinish directly for AI games
      onFinish(allResults);
      return;
    }

    // For real multiplayer games, wait for server response
    setWaitingForOpponents(true);
    await submitMultiplayerAnswers(roomId, odId, finalAnswers, score);
  };

  const normalizeDecimalInput = (input: string) => {
    const cleaned = input.replace(/[^0-9.]/g, "");
    const firstDotIndex = cleaned.indexOf(".");
    if (firstDotIndex === -1) return cleaned;
    const head = cleaned.substring(0, firstDotIndex);
    const afterFirstDot = cleaned.substring(firstDotIndex + 1);
    const tail = afterFirstDot.replace(/\./g, "");
    if (cleaned.endsWith(".") && tail === "") return `${head}.`;
    return tail ? `${head}.${tail}` : head;
  };

  const handleAnswerChange = (index: number, value: string) => {
    const newAnswers = [...answers];
    const operation = questions[index].operation;

    let filteredValue = value;
    if (operation === "decimal-to-fraction" || operation === "percent-to-fraction") {
      filteredValue = value.replace(/[^0-9/]/g, "");
      const parts = filteredValue.split("/");
      if (parts.length > 2) {
        filteredValue = `${parts[0]}/${parts.slice(1).join("")}`;
      }
    } else if (operation === "fraction-to-percent") {
      filteredValue = normalizeDecimalInput(value);
    } else if (operation === "negative-numbers") {
      filteredValue = value.replace(/[^0-9-]/g, "");
      if (filteredValue.includes("-")) {
        const hasMinus = filteredValue.startsWith("-");
        filteredValue = filteredValue.replace(/-/g, "");
        if (hasMinus) filteredValue = "-" + filteredValue;
      }
    } else {
      filteredValue = normalizeDecimalInput(value);
    }

    newAnswers[index] = filteredValue;
    setAnswers(newAnswers);

    // Report progress (only when moving forward)
    const filledCount = newAnswers.filter((a) => a.trim() !== "").length;
    if (filledCount > lastProgressRef.current) {
      lastProgressRef.current = filledCount;
      updateProgress(roomId, odId, filledCount);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter" && index < questions.length - 1 && inputRefs.current[index + 1]) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmitQuiz(answers, elapsedTime);
  };

  const formatTime = (seconds: number) => seconds.toFixed(3);

  const formatCountdownTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.ceil(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
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

  const remainingTime = timeLimit > 0 ? timeLimit - elapsedTime : Infinity;
  const isTimeLow = remainingTime <= 10;

  const isConversionMode =
    questions[0]?.operation === "fraction-to-decimal" ||
    questions[0]?.operation === "decimal-to-fraction" ||
    questions[0]?.operation === "fraction-to-percent" ||
    questions[0]?.operation === "percent-to-fraction";

  const usesDisplayProperty = isConversionMode || questions[0]?.operation === "negative-numbers";

  // Waiting for opponents screen
  if (waitingForOpponents && !allOpponentsFinished) {
    const stillPlaying = opponents.filter((p) => !opponentFinished[p.id] && !disconnectedPlayers.has(p.id));
    
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 flex items-center justify-center transition-colors duration-300">
        <div className="max-w-2xl w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 md:p-12">
          <div className="text-center">
            <div className="animate-spin w-20 h-20 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 rounded-full mx-auto mb-6"></div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800 dark:text-white mb-4">Great job!</h2>
            <p className="text-lg md:text-xl text-slate-500 dark:text-slate-400 mb-6">
              Waiting for {stillPlaying.length === 1 ? stillPlaying[0].name : 'others'} to finish...
            </p>
            
            {/* Opponents Progress */}
            <div className="space-y-3">
              {opponents.map((opponent) => {
                const progress = opponentProgress[opponent.id] || 0;
                const isFinished = opponentFinished[opponent.id];
                const isDisconnected = disconnectedPlayers.has(opponent.id);
                const isTeammate = myTeam?.playerIds.includes(opponent.id);
                
                return (
                  <div 
                    key={opponent.id}
                    className={`rounded-xl p-4 ${
                      isTeammate 
                        ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                        : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className={`text-sm font-medium ${
                        isTeammate ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'
                      }`}>
                        {opponent.name} {isTeammate && '(Teammate)'}
                      </span>
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        {isDisconnected ? '❌ Disconnected' : isFinished ? '✅ Finished!' : `${progress} / ${questions.length}`}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          isDisconnected ? 'bg-red-500' : isFinished ? 'bg-green-500' : isTeammate ? 'bg-blue-500' : 'bg-orange-500'
                        }`}
                        style={{ width: `${isFinished ? 100 : (progress / questions.length) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 relative min-h-[600px]">
      {/* Player Finished Popup - at top to not distract */}
      {showFinishedPopup && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-yellow-500 text-white px-6 py-3 rounded-xl shadow-2xl animate-pop-in">
            <p className="text-lg font-bold">🏁 {showFinishedPopup} finished!</p>
          </div>
        </div>
      )}

      {/* Disconnected Players Banner */}
      {disconnectedPlayers.size > 0 && (
        <div className="absolute top-4 left-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg text-center font-semibold z-40">
          {Array.from(disconnectedPlayers).map(id => players.find(p => p.id === id)?.name).filter(Boolean).join(', ')} disconnected
        </div>
      )}

      {/* Intro animation */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ visibility: introStage !== "finished" ? "visible" : "hidden" }}
      >
        <p
          key={introStage}
          className="text-8xl font-extrabold text-slate-800 dark:text-white animate-word-pulse capitalize"
        >
          {introStage}...
        </p>
      </div>

      {/* Quiz Content */}
      <div className={introStage === "finished" ? "animate-fade-in" : "opacity-0"}>
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-white">
            Multiplayer Quiz
          </h1>
          <div
            className={`flex items-center gap-2 text-lg font-bold p-3 rounded-full bg-slate-100 dark:bg-slate-800 transition-colors duration-300 ${
              isTimeLow ? "text-red-600 dark:text-red-500 animate-pulse" : "text-slate-800 dark:text-slate-200"
            }`}
          >
            <ClockIcon className="w-6 h-6" />
            <span>{timeLimit > 0 ? formatCountdownTime(remainingTime) : formatTime(elapsedTime)}</span>
          </div>
        </div>

        {/* Opponents Progress Bars */}
        <div className="mb-6 space-y-2">
          {/* Team mode: show teammates first with different color */}
          {gameMode === 'teams' && myTeammates.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">🔵 Your Team</p>
              {myTeammates.map((teammate) => {
                const progress = opponentProgress[teammate.id] || 0;
                const isFinished = opponentFinished[teammate.id];
                const isDisconnected = disconnectedPlayers.has(teammate.id);
                return (
                  <div key={teammate.id} className="mb-2 last:mb-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        {teammate.name}
                      </span>
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        {isDisconnected ? '❌' : isFinished ? "✅" : `${progress}/${questions.length}`}
                      </span>
                    </div>
                    <div className="w-full bg-blue-100 dark:bg-blue-800/30 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          isDisconnected ? 'bg-red-500' : isFinished ? "bg-green-500" : "bg-blue-500"
                        }`}
                        style={{ width: `${isFinished ? 100 : (progress / questions.length) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Opponents */}
          <div className={`rounded-xl p-3 ${
            gameMode === 'teams' 
              ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' 
              : 'bg-slate-100 dark:bg-slate-800'
          }`}>
            {gameMode === 'teams' && (
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">🔴 Opponents</p>
            )}
            {myOpponents.map((opponent) => {
              const progress = opponentProgress[opponent.id] || 0;
              const isFinished = opponentFinished[opponent.id];
              const isDisconnected = disconnectedPlayers.has(opponent.id);
              return (
                <div key={opponent.id} className="mb-2 last:mb-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-sm font-medium ${
                      gameMode === 'teams' ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'
                    }`}>
                      {opponent.name}
                    </span>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {isDisconnected ? '❌' : isFinished ? "✅" : `${progress}/${questions.length}`}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        isDisconnected ? 'bg-red-500' : isFinished ? "bg-green-500" : "bg-orange-500"
                      }`}
                      style={{ width: `${isFinished ? 100 : (progress / questions.length) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Instructions */}
        {questions[0]?.operation === "fraction-to-decimal" && (
          <p className="text-center text-slate-500 dark:text-slate-400 mb-4 text-sm">
            For repeating decimals, enter the first three decimal places (e.g., for 1/3, enter 0.333).
          </p>
        )}
        {(questions[0]?.operation === "decimal-to-fraction" ||
          questions[0]?.operation === "percent-to-fraction") && (
          <p className="text-center text-slate-500 dark:text-slate-400 mb-4 text-sm">
            All fractions must be in simplest form.
          </p>
        )}
        {questions[0]?.operation === "fraction-to-percent" && (
          <p className="text-center text-slate-500 dark:text-slate-400 mb-4 text-sm">
            Enter the percent as a number; the % will be added for you.
          </p>
        )}

        {/* Questions */}
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            {questions.map((q, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg"
              >
                <span className="text-slate-500 dark:text-slate-400 font-bold w-6 text-right">
                  {index + 1}.
                </span>
                <div className="flex items-center gap-2 text-2xl font-bold text-slate-700 dark:text-slate-200 w-full">
                  {usesDisplayProperty ? (
                    <span className="w-32 text-center">{q.display}</span>
                  ) : (
                    <>
                      {q.operation === "square-roots" && <span>{getOperationSymbol(q.operation)}</span>}
                      <span className="w-10 text-right">{q.num1}</span>
                      {q.operation === "squares" ? (
                        <sup>2</sup>
                      ) : (
                        q.operation !== "square-roots" && <span>{getOperationSymbol(q.operation)}</span>
                      )}
                      {q.num2 && <span className="w-10 text-left">{q.num2}</span>}
                    </>
                  )}
                  <span>=</span>
                  <input
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode={
                      q.operation === "decimal-to-fraction" ||
                      q.operation === "fraction-to-percent" ||
                      q.operation === "percent-to-fraction"
                        ? "text"
                        : "numeric"
                    }
                    value={answers[index]}
                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    className="w-24 p-2 text-center text-2xl font-bold border-2 border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-slate-900"
                    maxLength={7}
                    disabled={quizFinished}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <button
              type="submit"
              disabled={quizFinished}
              className={`w-full sm:w-auto px-16 py-4 text-xl font-bold rounded-full shadow-lg transition-all duration-300 ${
                quizFinished
                  ? "bg-slate-400 text-white cursor-not-allowed"
                  : "text-white bg-blue-600 hover:shadow-xl transform hover:scale-105"
              }`}
            >
              {quizFinished ? "Submitted!" : "Submit Answers"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
