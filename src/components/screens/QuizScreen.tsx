import React, { useState, useEffect, useRef } from 'react';
import type { Question, Operation } from '@shared/types';
import { ClockIcon, CheckBadgeIcon } from '../ui/icons';
import { IntroCountdown } from '../ui/IntroCountdown';
import { playTimeUpSound } from '../../lib/audio';
import { useQuizTimer } from '../../hooks/useQuizTimer';
import { useIntroCountdown } from '../../hooks/useIntroCountdown';

interface QuizScreenProps {
  questions: Question[];
  timeLimit: number;
  onFinishQuiz: (answers: string[], timeTaken: number) => void;
}

export const QuizScreen: React.FC<QuizScreenProps> = ({ questions, timeLimit, onFinishQuiz }) => {
  const [answers, setAnswers] = useState<string[]>(Array(questions.length).fill(''));
  const [quizFinished, setQuizFinished] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const introStage = useIntroCountdown();

  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const quizFinishedRef = useRef(quizFinished);
  useEffect(() => {
    quizFinishedRef.current = quizFinished;
  }, [quizFinished]);

  const handleTick = (ms: number) => {
    const seconds = ms / 1000;
    if (timeLimit > 0 && seconds >= timeLimit) {
      stop();
      playTimeUpSound();
      window.setTimeout(() => {
        if (!quizFinishedRef.current) {
          setQuizFinished(true);
          onFinishQuiz(answersRef.current, timeLimit);
        }
      }, 300);
    }
  };

  const { elapsedMs, isRunning, start, stop } = useQuizTimer({ tickMs: 10, onTick: handleTick });
  const elapsedTime = timeLimit > 0 && elapsedMs / 1000 >= timeLimit ? timeLimit : elapsedMs / 1000;

  useEffect(() => {
    if (introStage === 'finished') {
      start();
      if (inputRefs.current[0]) inputRefs.current[0].focus();
    }
  }, [introStage, start]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isRunning && !quizFinished) {
        setQuizFinished(true);
        onFinishQuiz(answersRef.current, elapsedTime);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRunning, onFinishQuiz, elapsedTime, quizFinished]);

  const normalizeDecimalInput = (input: string) => {
    const cleaned = input.replace(/[^0-9.]/g, '');
    const firstDotIndex = cleaned.indexOf('.');
    if (firstDotIndex === -1) {
      // No decimal point
      return cleaned;
    }
    // Keep everything before first dot, the first dot, and everything after (up to next dot)
    const head = cleaned.substring(0, firstDotIndex);
    const afterFirstDot = cleaned.substring(firstDotIndex + 1);
    // Remove any additional decimal points from the tail
    const tail = afterFirstDot.replace(/\./g, '');
    // If the original input ended with a dot and tail is empty, preserve the dot
    const endsWithDot = cleaned.endsWith('.');
    if (endsWithDot && tail === '') {
      return `${head}.`;
    }
    return tail ? `${head}.${tail}` : head;
  };

  const handleAnswerChange = (index: number, value: string) => {
    const newAnswers = [...answers];
    const operation = questions[index].operation;
    
    let filteredValue = value;
    if (operation === 'decimal-to-fraction' || operation === 'percent-to-fraction') {
        // Allow numbers and a single '/'
        filteredValue = value.replace(/[^0-9/]/g, '');
        const parts = filteredValue.split('/');
        if (parts.length > 2) {
            filteredValue = `${parts[0]}/${parts.slice(1).join('')}`;
        }
    } else if (operation === 'fraction-to-percent') {
        // Allow numbers and one decimal point; we append the % later in results display
        filteredValue = normalizeDecimalInput(value);
    } else if (operation === 'negative-numbers') {
        // Allow numbers and an optional leading minus sign
        filteredValue = value.replace(/[^0-9-]/g, '');
        // Only allow minus at the start
        if (filteredValue.includes('-')) {
            const hasMinus = filteredValue.startsWith('-');
            filteredValue = filteredValue.replace(/-/g, '');
            if (hasMinus) {
                filteredValue = '-' + filteredValue;
            }
        }
    } else {
        // Allow numbers and a single '.' for other modes (including fraction-to-decimal)
        filteredValue = normalizeDecimalInput(value);
    }
    
    newAnswers[index] = filteredValue;
    setAnswers(newAnswers);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter' && index < questions.length - 1 && inputRefs.current[index + 1]) {
        e.preventDefault();
        inputRefs.current[index + 1]?.focus();
    }
  };

  const formatTime = (seconds: number) => {
    return seconds.toFixed(3);
  };

  const formatCountdownTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.ceil(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    stop();
    if (!quizFinished) {
      setQuizFinished(true);
      onFinishQuiz(answers, elapsedTime);
    }
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

  const remainingTime = timeLimit > 0 ? timeLimit - elapsedTime : Infinity;
  const isTimeLow = remainingTime <= 10;
  const answeredCount = answers.filter(a => a.trim() !== '').length;
  const progressPct = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;

  const isConversionMode =
    questions[0]?.operation === 'fraction-to-decimal' ||
    questions[0]?.operation === 'decimal-to-fraction' ||
    questions[0]?.operation === 'fraction-to-percent' ||
    questions[0]?.operation === 'percent-to-fraction';

  const usesDisplayProperty =
    isConversionMode ||
    questions[0]?.operation === 'negative-numbers';

  return (
    <div className="game-panel w-full max-w-4xl mx-auto p-5 sm:p-7 relative animate-fade-in" style={{ minHeight: '600px'}}>
        {/* Ready / Set / Go intro overlay */}
        <IntroCountdown stage={introStage} />


        {/* Actual quiz content, which fades in with a delay */}
        <div className={introStage === 'finished' ? 'animate-fade-in' : 'opacity-0'}>
            <div className="flex justify-between items-center gap-4 mb-4">
                <h1 className="font-display text-2xl sm:text-4xl font-bold text-slate-800 dark:text-white">Quiz Time!</h1>
                <div className={`flex items-center gap-2 text-lg font-display font-bold px-4 py-2.5 rounded-2xl border transition-colors duration-300 ${isTimeLow ? 'text-white bg-gradient-to-br from-rose-500 to-red-600 border-rose-600 animate-pulse shadow-lg shadow-rose-500/30' : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                    <ClockIcon className="w-5 h-5"/>
                    <span className="tabular-nums">
                      {timeLimit > 0 ? formatCountdownTime(remainingTime) : formatTime(elapsedTime)}
                    </span>
                </div>
            </div>

            {/* Progress bar */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                <span>Progress</span>
                <span className="tabular-nums">{answeredCount} / {questions.length} answered</span>
              </div>
              <div className="progress-track h-3 w-full">
                <div className="progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
            {questions[0]?.operation === 'fraction-to-decimal' && (
                <p className="text-center text-slate-500 dark:text-slate-400 mb-6 -mt-2">
                    Note: For repeating decimals, please enter the first three decimal places (e.g., for 1/3, enter 0.333).
                </p>
            )}
            {(questions[0]?.operation === 'decimal-to-fraction' || questions[0]?.operation === 'percent-to-fraction') && (
                <p className="text-center text-slate-500 dark:text-slate-400 mb-6 -mt-2">
                    Note: All fractions must be in simplest form.
                </p>
            )}
            {questions[0]?.operation === 'fraction-to-percent' && (
                <p className="text-center text-slate-500 dark:text-slate-400 mb-6 -mt-2">
                    Note: Enter the percent as a number; the % will be added for you (e.g., type 33.3 for 33.3%).
                </p>
            )}
            
            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
                    {questions.map((q, index) => {
                        const isFilled = answers[index]?.trim() !== '';
                        return (
                        <div key={index} className={`flex items-center gap-3 p-3 sm:p-3.5 rounded-2xl border transition-all duration-200 bg-slate-50 dark:bg-slate-800/50 ${isFilled ? 'border-violet-300 dark:border-violet-700/70' : 'border-slate-200 dark:border-slate-700/50'} focus-within:border-violet-400 dark:focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20`}>
                            <span className={`grid place-items-center w-7 h-7 shrink-0 rounded-lg font-display font-bold text-sm transition-colors ${isFilled ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>{index + 1}</span>
                            <div className="flex items-center gap-2 text-2xl font-display font-bold text-slate-700 dark:text-slate-200 w-full">
                               <span className="min-w-[3.5rem] text-right whitespace-nowrap">
                                 {usesDisplayProperty ? (
                                    q.display
                                 ) : q.operation === 'square-roots' ? (
                                    <span>{getOperationSymbol(q.operation)}{q.num1}</span>
                                 ) : q.operation === 'squares' ? (
                                    <span>{q.num1}<sup>2</sup></span>
                                 ) : (
                                    <span>{q.num1}<span className="mx-1.5 text-violet-500 dark:text-violet-400">{getOperationSymbol(q.operation)}</span>{q.num2}</span>
                                 )}
                               </span>
                               <span className="text-violet-500 dark:text-violet-400">=</span>
                               <input
                                    ref={el => { inputRefs.current[index] = el; }}
                                    type="text"
                                    inputMode={(q.operation === 'decimal-to-fraction' || q.operation === 'fraction-to-percent' || q.operation === 'percent-to-fraction') ? 'text' : 'numeric'}
                                    value={answers[index]}
                                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(e, index)}
                                    className="w-24 shrink-0 p-2 text-center text-2xl font-display font-bold border-2 border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                                    maxLength={7}
                               />
                               {import.meta.env.VITE_NODE_ENV === 'test' && (
                                <span data-cy={`correct-answer-${index}`} style={{ display: 'none' }}>
                                    {q.answer}
                                </span>
                               )}
                            </div>
                        </div>
                        );
                    })}
                </div>
                <div className="mt-8 text-center">
                    <button
                        type="submit"
                        className="btn3d btn3d--primary w-full sm:w-auto px-16 py-4 text-xl"
                    >
                        <CheckBadgeIcon className="w-6 h-6" />
                        Grade My Quiz
                    </button>
                </div>
            </form>
        </div>
    </div>
  );
};