import React, { useState, useEffect } from 'react';
import type { Operation, Question, HighScores, AllQuizStats } from '@shared/types';
import { DEFAULT_QUESTION_COUNT } from '@shared/types';
import { CheckCircleIcon, XCircleIcon, StarIcon, TrophyIcon, SparklesIcon, RocketIcon } from '../ui/icons';
import { Confetti } from '../ui/Confetti';
import { ScoreRing } from '../ui/ScoreRing';
import { ExplanationText } from '../ui/ExplanationText';
import { playWinSound, playCorrectSound } from '../../lib/audio';
import { feedbackMessages } from '../../lib/feedbackMessages';
import { formatPercentString } from '@shared/conversions';
import { logger } from '../../lib/logger';

const LEADERBOARD_SUPPORTED_OPERATIONS = new Set<Operation>([
  'multiplication',
  'division',
  'squares',
  'square-roots',
  'fraction-to-decimal',
  'decimal-to-fraction',
  'fraction-to-percent',
  'percent-to-fraction',
  'negative-numbers',
]);

const buildFallbackExplanation = (answer: string | number) =>
  `The correct answer is ${answer}. Keep trying!`;

const getExplanation = async (
  num1: number,
  num2: number | undefined,
  operation: string,
  answer: string | number
): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch('/api/get-explanation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ num1, num2, operation, answer }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error('Failed to fetch explanation');
    }

    const data = await response.json();
    return data.explanation || buildFallbackExplanation(answer);
  } catch (error) {
    console.error('Error fetching explanation:', error);
    return buildFallbackExplanation(answer);
  } finally {
    clearTimeout(timeout);
  }
};

const getFeedbackMessage = (correctCount: number, totalQuestions: number, timeTaken: number): string => {
    const score = correctCount / totalQuestions;
    const averageTimePerQuestion = timeTaken / totalQuestions;

    let category: keyof typeof feedbackMessages;

    if (score === 1) { // Perfect
        if (averageTimePerQuestion <= 3) category = 'perfect_rapid';
        else if (averageTimePerQuestion <= 6) category = 'perfect_fast';
        else if (averageTimePerQuestion <= 10) category = 'perfect_methodical';
        else category = 'perfect_deliberate';
    } else if (score >= 0.8) { // Great
        if (averageTimePerQuestion <= 4) category = 'great_rapid';
        else if (averageTimePerQuestion <= 7) category = 'great_fast';
        else if (averageTimePerQuestion <= 12) category = 'great_methodical';
        else category = 'great_deliberate';
    } else if (score >= 0.5) { // Good
        if (averageTimePerQuestion <= 5) category = 'good_rapid';
        else if (averageTimePerQuestion <= 8) category = 'good_fast';
        else if (averageTimePerQuestion <= 15) category = 'good_methodical';
        else category = 'good_deliberate';
    } else { // Practice
        category = 'practice';
    }

    const messages = feedbackMessages[category];
    return messages[Math.floor(Math.random() * messages.length)];
};


interface ResultsScreenProps {
  questions: Question[];
  userAnswers: string[];
  timeTaken: number;
  onPlayAgain: () => void;
  onRestart: () => void;
  quizSettings: {
    operation: Operation;
    selectedNumbers: number[];
    timeLimit: number;
    questionCount: number;
  };
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({ questions, userAnswers, timeTaken, onPlayAgain, onRestart, quizSettings }) => {
  const [feedback, setFeedback] = useState('');
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const [isTopScore, setIsTopScore] = useState<boolean | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const { operation, selectedNumbers } = quizSettings;
  const isConversionMode =
    operation === 'fraction-to-decimal' ||
    operation === 'decimal-to-fraction' ||
    operation === 'fraction-to-percent' ||
    operation === 'percent-to-fraction';
  const numbersForOperation = operation === 'squares' || operation === 'square-roots'
    ? Array.from({ length: 20 }, (_, i) => i + 1)
    : operation === 'negative-numbers'
    ? Array.from({ length: 10 }, (_, i) => i + 1)
    : Array.from({ length: 12 }, (_, i) => i + 1);
  const allNumbersSelected = isConversionMode ? true : selectedNumbers.length === numbersForOperation.length;

  type ExplanationState = {
    [key: number]: {
      text?: string;
      isLoading: boolean;
    }
  };
  const [explanations, setExplanations] = useState<ExplanationState>({});
  
  const normalizePercentAnswer = (value: string) => {
    const trimmed = value.trim();
    const numericPart = trimmed.replace(/[^0-9.]/g, '');
    if (!numericPart) return trimmed;
    const numericValue = parseFloat(numericPart);
    if (Number.isNaN(numericValue)) return trimmed;
    return formatPercentString(numericValue / 100);
  };

  const normalizeAnswerForComparison = (value: string | number, question: Question) => {
    const strValue = String(value ?? '').trim();
    if (!strValue) return '';

    if (question.operation === 'fraction-to-decimal') {
        return strValue.startsWith('.') ? `0${strValue}` : strValue;
    }

    if (question.operation === 'fraction-to-percent') {
        return normalizePercentAnswer(strValue);
    }

    return strValue;
  };

  const results = questions.map((q, i) => {
    const expectedAnswer = normalizeAnswerForComparison(q.answer, q);
    const normalizedUserAnswer = normalizeAnswerForComparison(userAnswers[i] ?? '', q);
    const isCorrect = normalizedUserAnswer === expectedAnswer;
    return {
        question: q,
        userAnswer: userAnswers[i],
        isCorrect: isCorrect
    };
  });

  const correctCount = results.filter(r => r.isCorrect).length;

  useEffect(() => {
    // Check if score is a top score
    const checkScore = async () => {
      // Eligibility for leaderboard: perfect score, all numbers selected (for non-conversion modes), and exactly 10 questions
      const hasDefaultQuestionCount = questions.length === DEFAULT_QUESTION_COUNT;
      const isLeaderboardOperation = LEADERBOARD_SUPPORTED_OPERATIONS.has(operation);
      const meetsScoreRequirements = correctCount === questions.length &&
                         questions.length > 0 &&
                         hasDefaultQuestionCount &&
                         (isConversionMode || allNumbersSelected);
      const isEligible = isLeaderboardOperation && meetsScoreRequirements;

      logger.log('[ResultsScreen] Leaderboard eligibility check', {
        operation,
        correctCount,
        totalQuestions: questions.length,
        isConversionMode,
        allNumbersSelected,
        hasDefaultQuestionCount,
        isLeaderboardOperation,
        isEligible,
      });

      if (isEligible) {
        const scoreInMs = Math.round(timeTaken * 1000);
        try {
          logger.log('[ResultsScreen] Submitting check-score request', {
            operation,
            scoreInMs,
          });
          const params = new URLSearchParams({
            operationType: operation,
            score: String(scoreInMs),
            questionCount: String(questions.length),
            selectedNumbersCount: String(selectedNumbers.length),
            allNumbersSelected: String(allNumbersSelected),
          });
          const response = await fetch(`/api/check-score?${params.toString()}`);
          const data = await response.json();
          logger.log('[ResultsScreen] check-score response', data);
          setIsTopScore(data.isTopScore);
        } catch (error) {
          console.error("Failed to check score:", error);
          setIsTopScore(false);
        }
      } else {
        setIsTopScore(false);
      }
    };
    checkScore();
  }, [correctCount, questions.length, timeTaken, operation, selectedNumbers]);

  useEffect(() => {
    const message = getFeedbackMessage(correctCount, questions.length, timeTaken);
    setFeedback(message);
  }, [correctCount, questions.length, timeTaken]);

  useEffect(() => {
    // High Score Logic
    const HIGH_SCORES_KEY = 'mathWhizHighScores';
    try {
      const storedScoresRaw = localStorage.getItem(HIGH_SCORES_KEY);
      const highScores: HighScores = storedScoresRaw ? JSON.parse(storedScoresRaw) : {};
      
      const key = operation;
      const existingScore = highScores[key];

      const isBetterScore = !existingScore || 
                            correctCount > existingScore.score || 
                            (correctCount === existingScore.score && timeTaken < existingScore.time);
      
      if (isBetterScore) {
        highScores[key] = {
          score: correctCount,
          time: timeTaken,
          date: new Date().toISOString(),
        };
        localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(highScores));
        setIsNewHighScore(true);
      }
    } catch (error) {
      console.error("Failed to process high scores:", error);
    }

    // Statistics Logic
    const STATS_KEY = 'mathWhizStats';
    try {
        const storedStatsRaw = localStorage.getItem(STATS_KEY);
        const allStats: AllQuizStats = storedStatsRaw ? JSON.parse(storedStatsRaw) : {};
        
        const currentStats = allStats[operation] || {
            totalQuizzes: 0,
            totalCorrect: 0,
            totalTime: 0,
            numberFrequency: {}
        };

        currentStats.totalQuizzes += 1;
        currentStats.totalCorrect += correctCount;
        currentStats.totalTime += timeTaken;

        selectedNumbers.forEach(num => {
            currentStats.numberFrequency[num] = (currentStats.numberFrequency[num] || 0) + 1;
        });

        allStats[operation] = currentStats;
        localStorage.setItem(STATS_KEY, JSON.stringify(allStats));

    } catch (error) {
        console.error("Failed to process stats:", error);
    }

  }, [correctCount, timeTaken, operation, selectedNumbers]);

  // Celebrate the result on mount: confetti + a happy sound for a perfect run,
  // a friendly ding for a solid score. Never plays a discouraging sound.
  useEffect(() => {
    const perfect = questions.length > 0 && correctCount === questions.length;
    if (perfect) {
      playWinSound();
      setCelebrate(true);
      const t = window.setTimeout(() => setCelebrate(false), 6500);
      return () => window.clearTimeout(t);
    }
    if (questions.length > 0 && correctCount / questions.length >= 0.5) {
      playCorrectSound();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A fresh personal best also earns a confetti burst.
  useEffect(() => {
    if (!isNewHighScore) return;
    setCelebrate(true);
    const t = window.setTimeout(() => setCelebrate(false), 6500);
    return () => window.clearTimeout(t);
  }, [isNewHighScore]);

  const handleSubmitScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || submissionStatus === 'submitting') return;

    setSubmissionStatus('submitting');
    setErrorMessage('');
    const scoreInMs = Math.round(timeTaken * 1000);

    try {
      const response = await fetch('/api/submit-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: playerName.trim(),
          score: scoreInMs,
          operationType: operation,
          questionCount: questions.length,
          selectedNumbersCount: selectedNumbers.length,
          allNumbersSelected,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'An error occurred.');
      }

      setSubmissionStatus('submitted');
    } catch (error) {
      setSubmissionStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'An error occurred.');
    }
  };

  const handleExplain = async (index: number) => {
    const question = questions[index];
    if (!question || explanations[index]?.isLoading || explanations[index]?.text) return;

    setExplanations(prev => ({ ...prev, [index]: { isLoading: true } }));
    const explanationText = await getExplanation(question.num1, question.num2, question.operation, question.answer);
    setExplanations(prev => ({ ...prev, [index]: { text: explanationText, isLoading: false } }));
  };
  
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round((seconds % 60) * 10) / 10;
    const timeParts = [];
    if (minutes > 0) timeParts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
    if (remainingSeconds > 0) timeParts.push(`${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}`);
    return timeParts.length > 0 ? timeParts.join(' and ') : '0 seconds';
  };
  
  const getOperationSymbol = (op: Operation) => {
    switch (op) {
      case 'multiplication': return '×';
      case 'division': return '÷';
      case 'squares': return '²';
      case 'square-roots': return '√';
      case 'negative-numbers': return '±';
      default: return '?';
    }
  };

  const ratio = questions.length > 0 ? correctCount / questions.length : 0;
  const headline =
    ratio === 1 ? 'Perfect Score!' : ratio >= 0.8 ? 'Awesome!' : ratio >= 0.5 ? 'Nice Work!' : 'Keep Practicing!';

  return (
    <div className="game-panel w-full max-w-4xl mx-auto p-5 sm:p-7 relative animate-fade-in">
        {celebrate && <Confetti />}
        <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <ScoreRing correct={correctCount} total={questions.length} />
            </div>
            <h1 className="font-display text-3xl sm:text-5xl font-bold text-gradient leading-tight pb-1 flex flex-wrap items-center justify-center gap-2">
              {ratio >= 0.8 && <SparklesIcon className="w-7 h-7 text-amber-400 shrink-0" />}
              <span>{headline}</span>
              {ratio >= 0.8 && <SparklesIcon className="w-7 h-7 text-amber-400 shrink-0" />}
            </h1>
            {isNewHighScore && (
                <div className="mt-4 flex justify-center">
                    <div className="px-4 py-2.5 bg-gradient-to-r from-amber-400 to-yellow-500 rounded-2xl inline-flex items-center justify-center gap-2 animate-tada shadow-lg shadow-amber-500/40">
                        <StarIcon className="w-6 h-6 text-white" />
                        <span className="text-lg font-display font-bold text-white">New Personal High Score!</span>
                    </div>
                </div>
            )}
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 mt-5 mb-2 px-4 py-3 glass rounded-2xl italic max-w-lg mx-auto">"{feedback}"</p>
            <p className="text-lg text-slate-500 dark:text-slate-400 mt-3">
              Total time: <span className="font-display font-bold text-slate-700 dark:text-slate-200">{formatTime(timeTaken)}</span>
            </p>
        </div>

        {isTopScore && submissionStatus !== 'submitted' && (
          <div className="my-6 p-6 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-900/20 dark:to-fuchsia-900/20 border-2 border-violet-300 dark:border-violet-500/40 rounded-3xl animate-bounce-in text-center relative">
            <button
              onClick={() => setIsTopScore(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              aria-label="Close submission form"
            >
              <XCircleIcon className="w-6 h-6" />
            </button>
            <div className="flex items-center justify-center gap-3 mb-3">
              <TrophyIcon className="w-9 h-9 text-amber-500 animate-float" />
              <h2 className="font-display text-2xl font-bold text-violet-700 dark:text-violet-300">You're in the Top 5!</h2>
            </div>
            <p className="text-violet-700 dark:text-violet-300/90 mb-1 font-medium">Enter your name to join the global leaderboard.</p>
            <p className="text-sm text-violet-500 dark:text-violet-400 mb-4">(First name or nickname recommended)</p>
            <form onSubmit={handleSubmitScore} className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                maxLength={50}
                required
                className="w-full sm:w-64 px-4 py-3 text-lg border-2 border-violet-200 dark:border-violet-500/40 rounded-2xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={submissionStatus === 'submitting'}
                className="btn3d btn3d--gold w-full sm:w-auto px-8 py-3 text-lg"
              >
                {submissionStatus === 'submitting' ? 'Submitting...' : 'Submit Score'}
              </button>
            </form>
            {submissionStatus === 'error' && <p className="text-rose-500 mt-3 font-semibold">{errorMessage}</p>}
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 italic">
              Already on the leaderboard? Use the same name to replace your old score (only if this one is better).
            </p>
          </div>
        )}

        {submissionStatus === 'submitted' && (
          <div className="my-6 p-4 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl text-center animate-bounce-in shadow-lg shadow-emerald-500/30">
            <p className="font-display font-bold text-white text-lg">🎉 Your score is on the leaderboard!</p>
          </div>
        )}

        <div className="space-y-2.5">
            {results.map((result, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-2xl border-l-4 animate-slide-up ${result.isCorrect ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500' : 'bg-rose-50 dark:bg-rose-500/10 border-rose-500'}`}
                  style={{ animationDelay: `${Math.min(index * 60, 600)}ms` }}
                >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                          <span className={`grid place-items-center w-7 h-7 shrink-0 rounded-lg font-display font-bold text-sm text-white ${result.isCorrect ? 'bg-emerald-500' : 'bg-rose-500'}`}>{index + 1}</span>
                          <p className="text-xl font-display font-bold text-slate-800 dark:text-slate-200">
                              {result.question.display ? (
                                <span>{result.question.display}</span>
                              ) : (
                                <>
                                  {result.question.operation === 'square-roots' && getOperationSymbol(result.question.operation)}
                                  {result.question.num1}
                                  {result.question.operation === 'squares' ? <sup>2</sup> : (result.question.operation !== 'square-roots' && getOperationSymbol(result.question.operation))}
                                  {result.question.num2 && ` ${result.question.num2}`}
                                </>
                              )}
                               = <span className="text-violet-600 dark:text-violet-400">{String(result.question.answer)}</span>
                          </p>
                      </div>
                      <div className="flex items-center gap-3">
                          {result.isCorrect ? (
                              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                                  <span className="font-display font-bold text-lg">{result.userAnswer || 'N/A'}</span>
                                  <CheckCircleIcon className="w-7 h-7 animate-pop-in" style={{ animationDelay: `${index * 100}ms` }} />
                              </div>
                          ) : (
                              <div className="flex items-center gap-3 text-rose-500 dark:text-rose-400">
                                  <span className="font-display font-bold text-lg line-through opacity-80">{result.userAnswer || 'N/A'}</span>
                                  <XCircleIcon className="w-7 h-7 animate-pop-in" style={{ animationDelay: `${index * 100}ms` }} />
                              </div>
                          )}
                      </div>
                    </div>
                    {!result.isCorrect && (
                      <div className="mt-3 border-t pt-3 border-rose-200 dark:border-rose-500/20">
                          {explanations[index]?.text ? (
                              <div className="p-3 glass rounded-xl animate-fade-in">
                                  <ExplanationText text={explanations[index].text!} />
                              </div>
                          ) : (
                              <button
                                  onClick={() => handleExplain(index)}
                                  disabled={explanations[index]?.isLoading}
                                  className="btn3d btn3d--secondary px-4 py-1.5 text-sm"
                              >
                                  {explanations[index]?.isLoading ? (
                                    <span className="inline-flex items-center gap-2">
                                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                      Thinking...
                                    </span>
                                  ) : (
                                    <>
                                      <SparklesIcon className="w-4 h-4" />
                                      Explain Answer
                                    </>
                                  )}
                              </button>
                          )}
                      </div>
                    )}
                </div>
            ))}
        </div>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
                onClick={onPlayAgain}
                className="btn3d btn3d--party w-full sm:w-auto px-12 py-4 text-xl"
            >
                <RocketIcon className="w-6 h-6" />
                Play Again
            </button>
            <button
                onClick={onRestart}
                className="btn3d btn3d--neutral w-full sm:w-auto px-12 py-4 text-xl"
            >
                Back to Menu
            </button>
        </div>
    </div>
  );
};
