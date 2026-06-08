import React, { useState, useEffect, useRef } from 'react';
import type { Question, Operation } from '@shared/types';
import { ClockIcon } from '../ui/icons';
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

  const isConversionMode =
    questions[0]?.operation === 'fraction-to-decimal' ||
    questions[0]?.operation === 'decimal-to-fraction' ||
    questions[0]?.operation === 'fraction-to-percent' ||
    questions[0]?.operation === 'percent-to-fraction';

  const usesDisplayProperty =
    isConversionMode ||
    questions[0]?.operation === 'negative-numbers';


  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 relative" style={{ minHeight: '600px'}}>
        {/* Intro animation element */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ visibility: introStage !== 'finished' ? 'visible' : 'hidden' }}>
            <p key={introStage} className="text-8xl font-extrabold text-slate-800 dark:text-white animate-word-pulse capitalize">
              {introStage}...
            </p>
        </div>


        {/* Actual quiz content, which fades in with a delay */}
        <div className={introStage === 'finished' ? 'animate-fade-in' : 'opacity-0'}>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-800 dark:text-white">Quiz in Progress</h1>
                <div className={`flex items-center gap-2 text-lg font-bold p-3 rounded-full bg-slate-100 dark:bg-slate-800 transition-colors duration-300 ${isTimeLow ? 'text-red-600 dark:text-red-500 animate-pulse' : 'text-slate-800 dark:text-slate-200'}`}>
                    <ClockIcon className="w-6 h-6"/>
                    <span>
                      {timeLimit > 0 ? formatCountdownTime(remainingTime) : formatTime(elapsedTime)}
                    </span>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                    {questions.map((q, index) => (
                        <div key={index} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                            <span className="text-slate-500 dark:text-slate-400 font-bold w-6 text-right">{index + 1}.</span>
                            <div className="flex items-center gap-2 text-2xl font-bold text-slate-700 dark:text-slate-200 w-full">
                               {usesDisplayProperty ? (
                                    <span className="w-32 text-center">{q.display}</span>
                                ) : (
                                    <>
                                        {q.operation === 'square-roots' && <span>{getOperationSymbol(q.operation)}</span>}
                                        <span className="w-10 text-right">{q.num1}</span>
                                        {q.operation === 'squares' ? <sup>2</sup> : (q.operation !== 'square-roots' && <span>{getOperationSymbol(q.operation)}</span>)}
                                        {q.num2 && <span className="w-10 text-left">{q.num2}</span>}
                                    </>
                                )}
                               <span>=</span>
                               <input
                                    ref={el => { inputRefs.current[index] = el; }}
                                    type="text"
                                    inputMode={(q.operation === 'decimal-to-fraction' || q.operation === 'fraction-to-percent' || q.operation === 'percent-to-fraction') ? 'text' : 'numeric'}
                                    value={answers[index]}
                                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(e, index)}
                                    className="w-24 p-2 text-center text-2xl font-bold border-2 border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-slate-900"
                                    maxLength={7}
                               />
                               {import.meta.env.VITE_NODE_ENV === 'test' && (
                                <span data-cy={`correct-answer-${index}`} style={{ display: 'none' }}>
                                    {q.answer}
                                </span>
                               )}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-8 text-center">
                    <button
                        type="submit"
                        className="w-full sm:w-auto px-16 py-4 text-xl font-bold text-white bg-blue-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
                    >
                        Grade My Quiz
                    </button>
                </div>
            </form>
        </div>
    </div>
  );
};