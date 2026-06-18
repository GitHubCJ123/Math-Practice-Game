import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Question, Operation, MultiplayerResult, Team, GameMode, Player, TeamResult, AIDifficulty } from "@shared/types";
import { ClockIcon, CheckBadgeIcon } from "../ui/icons";
import { IntroCountdown } from "../ui/IntroCountdown";
import {
  getPusherClient,
  updateProgress,
  submitMultiplayerAnswers,
  notifyDisconnect,
} from "../../lib/multiplayer";
import { playTimeUpSound } from "../../lib/audio";

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
    playerId: aiPlayer.id,
    playerName: aiPlayer.name,
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
  playerId: string;
  playerName: string;
  questions: Question[];
  timeLimit: number;
  players: Player[];
  teams: Team[];
  gameMode: GameMode;
  onFinish: (results: MultiplayerResult[], teamResults?: TeamResult[]) => void;
}


export const MultiplayerQuizScreen: React.FC<MultiplayerQuizScreenProps> = ({
  roomId,
  playerId,
  playerName,
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
  const opponents = players.filter((p) => p.id !== playerId);
  const aiOpponent = opponents.find((p) => p.isAI);
  const isAIGame = !!aiOpponent;
  const myTeam = teams.find((t) => t.playerIds.includes(playerId));
  const myTeammates = myTeam ? players.filter((p) => myTeam.playerIds.includes(p.id) && p.id !== playerId) : [];
  const myOpponents = gameMode === 'teams' 
    ? players.filter((p) => !myTeam?.playerIds.includes(p.id))
    : opponents;
  const allOpponentsFinished = opponents.every((p) => opponentFinished[p.id] || disconnectedPlayers.has(p.id) || p.isAI);

  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Keep the latest callback/props/state reachable from the Pusher handlers
  // WITHOUT putting them in the subscription effect's dependency array. If the
  // subscription tears down and re-subscribes mid-game (e.g. when `quizFinished`
  // flips on submit), the terminal `game-ended` event can arrive during the gap
  // and be dropped — leaving the player stuck on "waiting for others to finish".
  const onFinishRef = useRef(onFinish);
  const playersRef = useRef(players);
  const quizFinishedRef = useRef(quizFinished);
  const finalizedRef = useRef(false);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { quizFinishedRef.current = quizFinished; }, [quizFinished]);

  // Navigate to the results screen exactly once, whether the trigger is the
  // Pusher `game-ended` broadcast or the authoritative HTTP submit response.
  const finalizeGame = useCallback((finalResults: MultiplayerResult[], finalTeamResults?: TeamResult[]) => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    onFinishRef.current(finalResults, finalTeamResults);
  }, []);

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

  // Subscribe to room channel for opponent events. Bind ONCE per room and read
  // the latest props/state through refs, so the subscription is never torn down
  // and re-created during the game. A resubscribe gap can otherwise drop the
  // terminal `game-ended` event (most likely for the last player to finish,
  // whose own submit triggers it), stranding them on the waiting screen.
  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`room-${roomId}`);

    const handleProgress = (data: { playerId: string; currentQuestion: number }) => {
      if (data.playerId !== playerId) {
        setOpponentProgress((prev) => ({ ...prev, [data.playerId]: data.currentQuestion }));
      }
    };

    const handleFinished = (data: { playerId: string; finishTime: number }) => {
      if (data.playerId !== playerId) {
        setOpponentFinished((prev) => ({ ...prev, [data.playerId]: true }));
        if (!quizFinishedRef.current) {
          const finishedPlayer = playersRef.current.find((p) => p.id === data.playerId);
          setShowFinishedPopup(finishedPlayer?.name || "Someone");
          setTimeout(() => setShowFinishedPopup(null), 2000);
        }
      }
    };

    const handleGameEnded = (data: { results: MultiplayerResult[]; teamResults?: TeamResult[] }) => {
      finalizeGame(data.results, data.teamResults);
    };

    const handleDisconnected = (data: { playerId: string }) => {
      if (data.playerId !== playerId) {
        setDisconnectedPlayers((prev) => new Set([...prev, data.playerId]));
        setOpponentFinished((prev) => ({ ...prev, [data.playerId]: true }));
      }
    };

    channel.bind("opponent-progress", handleProgress);
    channel.bind("opponent-finished", handleFinished);
    channel.bind("game-ended", handleGameEnded);
    channel.bind("player-disconnected", handleDisconnected);

    // Notify server on page unload
    const handleBeforeUnload = () => {
      notifyDisconnect(roomId, playerId);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      channel.unbind("opponent-progress", handleProgress);
      channel.unbind("opponent-finished", handleFinished);
      channel.unbind("game-ended", handleGameEnded);
      channel.unbind("player-disconnected", handleDisconnected);
      pusher.unsubscribe(`room-${roomId}`);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [roomId, playerId, finalizeGame]);

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
        playerId,
        playerName,
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
      finalizeGame(allResults);
      return;
    }

    // For real multiplayer games, wait for server response
    setWaitingForOpponents(true);
    const response = await submitMultiplayerAnswers(roomId, playerId, finalAnswers, score);

    // If this submit was the one that completed the game, the server returns the
    // full ranked results synchronously. Finalize from this authoritative
    // response so we don't depend solely on the `game-ended` broadcast, which
    // can be missed.
    if (response?.success && response.allFinished && response.results) {
      finalizeGame(response.results, response.teamResults);
    }
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
      updateProgress(roomId, playerId, filledCount);
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

  const answeredCount = answers.filter((a) => a.trim() !== "").length;
  const progressPct = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;

  // Waiting for opponents screen
  if (waitingForOpponents && !allOpponentsFinished) {
    const stillPlaying = opponents.filter((p) => !opponentFinished[p.id] && !disconnectedPlayers.has(p.id));
    
    return (
      <div className="w-full flex items-center justify-center p-2 transition-colors duration-300">
        <div className="game-panel max-w-2xl w-full p-8 md:p-12 animate-fade-in">
          <div className="text-center">
            <div className="animate-spin w-20 h-20 border-4 border-violet-200 dark:border-violet-900 border-t-violet-600 rounded-full mx-auto mb-6"></div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-800 dark:text-white mb-4">Great job!</h2>
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
    <div className="game-panel w-full max-w-4xl mx-auto p-5 sm:p-7 relative min-h-[600px] animate-fade-in">
      {/* Player Finished Popup - at top to not distract */}
      {showFinishedPopup && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-gradient-to-r from-amber-400 to-orange-500 text-white px-6 py-3 rounded-2xl shadow-2xl shadow-amber-500/40 animate-pop-in">
            <p className="text-lg font-display font-bold">🏁 {showFinishedPopup} finished!</p>
          </div>
        </div>
      )}

      {/* Disconnected Players Banner */}
      {disconnectedPlayers.size > 0 && (
        <div className="absolute top-4 left-4 right-4 bg-gradient-to-r from-rose-500 to-red-600 text-white px-4 py-2 rounded-xl text-center font-semibold z-40 shadow-lg">
          {Array.from(disconnectedPlayers).map(id => players.find(p => p.id === id)?.name).filter(Boolean).join(', ')} disconnected
        </div>
      )}

      {/* Ready / Set / Go intro overlay */}
      <IntroCountdown stage={introStage} />

      {/* Quiz Content */}
      <div className={introStage === "finished" ? "animate-fade-in" : "opacity-0"}>
        {/* Header */}
        <div className="flex justify-between items-center gap-4 mb-4">
          <h1 className="font-display text-2xl sm:text-4xl font-bold text-slate-800 dark:text-white">
            Multiplayer
          </h1>
          <div
            className={`flex items-center gap-2 text-lg font-display font-bold px-4 py-2.5 rounded-2xl border transition-colors duration-300 ${
              isTimeLow ? "text-white bg-gradient-to-br from-rose-500 to-red-600 border-rose-600 animate-pulse shadow-lg shadow-rose-500/30" : "text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            }`}
          >
            <ClockIcon className="w-5 h-5" />
            <span className="tabular-nums">{timeLimit > 0 ? formatCountdownTime(remainingTime) : formatTime(elapsedTime)}</span>
          </div>
        </div>

        {/* Progress bar (matches solo) */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>Progress</span>
            <span className="tabular-nums">{answeredCount} / {questions.length} answered</span>
          </div>
          <div className="progress-track h-3 w-full">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
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
          <p className="text-center text-slate-500 dark:text-slate-400 mb-6 -mt-2">
            Note: For repeating decimals, please enter the first three decimal places (e.g., for 1/3, enter 0.333).
          </p>
        )}
        {(questions[0]?.operation === "decimal-to-fraction" ||
          questions[0]?.operation === "percent-to-fraction") && (
          <p className="text-center text-slate-500 dark:text-slate-400 mb-6 -mt-2">
            Note: All fractions must be in simplest form.
          </p>
        )}
        {questions[0]?.operation === "fraction-to-percent" && (
          <p className="text-center text-slate-500 dark:text-slate-400 mb-6 -mt-2">
            Note: Enter the percent as a number; the % will be added for you (e.g., type 33.3 for 33.3%).
          </p>
        )}

        {/* Questions */}
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
            {questions.map((q, index) => {
              const isFilled = answers[index]?.trim() !== "";
              return (
                <div
                  key={index}
                  className={`flex items-center gap-3 p-3 sm:p-3.5 rounded-2xl border transition-all duration-200 bg-slate-50 dark:bg-slate-800/50 ${isFilled ? "border-violet-300 dark:border-violet-700/70" : "border-slate-200 dark:border-slate-700/50"} focus-within:border-violet-400 dark:focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20`}
                >
                  <span className={`grid place-items-center w-7 h-7 shrink-0 rounded-lg font-display font-bold text-sm transition-colors ${isFilled ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"}`}>
                    {index + 1}
                  </span>
                  <div className="flex items-center gap-2 text-2xl font-display font-bold text-slate-700 dark:text-slate-200 w-full">
                    <span className="min-w-[3.5rem] text-right whitespace-nowrap">
                      {usesDisplayProperty ? (
                        q.display
                      ) : q.operation === "square-roots" ? (
                        <span>{getOperationSymbol(q.operation)}{q.num1}</span>
                      ) : q.operation === "squares" ? (
                        <span>{q.num1}<sup>2</sup></span>
                      ) : (
                        <span>{q.num1}<span className="mx-1.5 text-violet-500 dark:text-violet-400">{getOperationSymbol(q.operation)}</span>{q.num2}</span>
                      )}
                    </span>
                    <span className="text-violet-500 dark:text-violet-400">=</span>
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
                      className="w-24 shrink-0 p-2 text-center text-2xl font-display font-bold border-2 border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                      maxLength={7}
                      disabled={quizFinished}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-8 text-center">
            <button
              type="submit"
              disabled={quizFinished}
              className="btn3d btn3d--primary w-full sm:w-auto px-16 py-4 text-xl"
            >
              <CheckBadgeIcon className="w-6 h-6" />
              {quizFinished ? "Submitted!" : "Submit Answers"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
