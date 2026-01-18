import React, { useState, useEffect, useRef } from "react";
import Pusher, { Channel } from "pusher-js";
import type { Question, Operation, MultiplayerResult } from "../../../types";
import { ClockIcon } from "../ui/icons";
import {
  getPusherClient,
  updateProgress,
  submitMultiplayerAnswers,
  notifyDisconnect,
} from "../../lib/multiplayer";

interface MultiplayerQuizScreenProps {
  roomId: string;
  odId: string;
  odName: string;
  questions: Question[];
  timeLimit: number;
  opponent: { id: string; name: string };
  onFinish: (results: MultiplayerResult[]) => void;
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
  opponent,
  onFinish,
}) => {
  const [answers, setAnswers] = useState<string[]>(Array(questions.length).fill(""));
  const [elapsedTime, setElapsedTime] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [introStage, setIntroStage] = useState<"ready" | "set" | "go" | "finished">("ready");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Opponent state
  const [opponentProgress, setOpponentProgress] = useState(0);
  const [opponentFinished, setOpponentFinished] = useState(false);
  const [showOpponentFinishedPopup, setShowOpponentFinishedPopup] = useState(false);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);

  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const lastProgressRef = useRef(0);

  // Subscribe to room channel for opponent events
  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`room-${roomId}`);

    channel.bind("opponent-progress", (data: { odId: string; currentQuestion: number }) => {
      if (data.odId !== odId) {
        setOpponentProgress(data.currentQuestion);
      }
    });

    channel.bind("opponent-finished", (data: { odId: string; finishTime: number }) => {
      if (data.odId !== odId) {
        setOpponentFinished(true);
        if (!quizFinished) {
          setShowOpponentFinishedPopup(true);
          setTimeout(() => setShowOpponentFinishedPopup(false), 3000);
        }
      }
    });

    channel.bind("game-ended", (data: { results: MultiplayerResult[] }) => {
      onFinish(data.results);
    });

    channel.bind("player-disconnected", (data: { odId: string }) => {
      if (data.odId !== odId) {
        setOpponentDisconnected(true);
        setOpponentFinished(true);
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
  }, [roomId, odId, onFinish, quizFinished]);

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

  // Timer
  useEffect(() => {
    if (!timerRunning) return;
    const intervalId = setInterval(() => {
      setElapsedTime((prev) => {
        const newElapsedTime = prev + 0.01;
        if (timeLimit > 0 && newElapsedTime >= timeLimit) {
          clearInterval(intervalId);
          setTimerRunning(false);
          playTimeUpSound();
          setTimeout(() => {
            if (!quizFinished) {
              handleSubmitQuiz(answersRef.current, timeLimit);
            }
          }, 300);
          return timeLimit;
        }
        return newElapsedTime;
      });
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
    setWaitingForOpponent(true);

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

  // Waiting for opponent screen
  if (waitingForOpponent && !opponentFinished) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 flex items-center justify-center transition-colors duration-300">
        <div className="max-w-2xl w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-12 md:p-16">
          <div className="text-center">
            <div className="animate-spin w-24 h-24 border-6 border-blue-200 dark:border-blue-800 border-t-blue-600 rounded-full mx-auto mb-8" style={{ borderWidth: '6px' }}></div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-800 dark:text-white mb-4">Great job!</h2>
            <p className="text-xl md:text-2xl text-slate-500 dark:text-slate-400 mb-6">
              Waiting for {opponent.name} to finish...
            </p>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-4 inline-block">
              <p className="text-lg text-slate-600 dark:text-slate-400">
                {opponent.name} is on question <span className="font-bold text-blue-600 dark:text-blue-400">{opponentProgress}</span> of {questions.length}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 relative min-h-[600px]">
      {/* Opponent Finished Popup - at top to not distract */}
      {showOpponentFinishedPopup && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-yellow-500 text-white px-6 py-3 rounded-xl shadow-2xl animate-pop-in">
            <p className="text-lg font-bold">🏁 {opponent.name} finished!</p>
          </div>
        </div>
      )}

      {/* Opponent Disconnected Banner */}
      {opponentDisconnected && (
        <div className="absolute top-4 left-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg text-center font-semibold z-40">
          {opponent.name} disconnected - You win!
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

        {/* Opponent Progress Bar */}
        <div className="mb-6 bg-slate-100 dark:bg-slate-800 rounded-xl p-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {opponent.name}'s Progress
            </span>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
              {opponentFinished ? "Finished!" : `${opponentProgress} / ${questions.length}`}
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                opponentFinished ? "bg-green-500" : "bg-orange-500"
              }`}
              style={{ width: `${(opponentProgress / questions.length) * 100}%` }}
            />
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
