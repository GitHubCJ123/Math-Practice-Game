import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Operation } from '@shared/types';
import {
  DEFAULT_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
  MAX_CONVERSION_QUESTION_COUNT,
} from '@shared/types';
import { ChartBarIcon, MoonIcon, SunIcon } from '../ui/icons';
import { StatisticsDisplay } from '../leaderboard/StatisticsDisplay';
import { GlobalLeaderboard } from '../leaderboard/GlobalLeaderboard';
import { HallOfFameDisplay } from '../leaderboard/HallOfFameDisplay';
import { HighScoresDisplay } from '../leaderboard/HighScoresDisplay';
import { ALL_OPERATIONS } from '../../lib/operations';

interface SelectionScreenProps {
  onStartQuiz: (operation: Operation, selectedNumbers: number[], timeLimit: number, questionCount: number) => void;
  initialSettings?: {
    operation: Operation;
    selectedNumbers: number[];
    timeLimit: number;
    questionCount: number;
  } | null;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const timeOptions = [
  { label: '30 Seconds', value: 30 },
  { label: '1 Minute', value: 60 },
  { label: '2 Minutes', value: 120 },
  { label: '5 Minutes', value: 300 },
  { label: 'No Limit', value: 0 },
];

const Section: React.FC<{ title: string; step: number; children: React.ReactNode }> = ({ title, step, children }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-blue-600 dark:text-blue-400 font-bold">{step}</div>
      <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h2>
    </div>
    {children}
  </div>
);

const operationButtons: { op: Operation; label: React.ReactNode }[] = [
  { op: 'multiplication', label: 'Multiplication (×)' },
  { op: 'division', label: 'Division (÷)' },
  { op: 'squares', label: <>Squares (x<sup>2</sup>)</> },
  { op: 'square-roots', label: 'Square Roots (√)' },
  { op: 'fraction-to-decimal', label: 'Fraction → Decimal' },
  { op: 'decimal-to-fraction', label: 'Decimal → Fraction' },
  { op: 'fraction-to-percent', label: 'Fraction → Percent' },
  { op: 'percent-to-fraction', label: 'Percent → Fraction' },
  { op: 'negative-numbers', label: 'Negative Numbers (±)' },
];

export const SelectionScreen: React.FC<SelectionScreenProps> = ({ onStartQuiz, initialSettings, isDarkMode, toggleDarkMode }) => {
  const [operation, setOperation] = useState<Operation>(initialSettings?.operation || 'multiplication');
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>(initialSettings?.selectedNumbers || []);
  const [timeLimit, setTimeLimit] = useState<number>(initialSettings?.timeLimit ?? 0);
  const [questionCount, setQuestionCount] = useState<number>(initialSettings?.questionCount ?? DEFAULT_QUESTION_COUNT);
  const [showStats, setShowStats] = useState(false);

  const isConversionMode =
    operation === 'fraction-to-decimal' ||
    operation === 'decimal-to-fraction' ||
    operation === 'fraction-to-percent' ||
    operation === 'percent-to-fraction';
  const isLeaderboardOperation = ALL_OPERATIONS.includes(operation);
  const maxQuestions = isConversionMode ? MAX_CONVERSION_QUESTION_COUNT : MAX_QUESTION_COUNT;

  const standardTimeValues = timeOptions.map(o => o.value);
  const isInitialTimeCustom = initialSettings && !standardTimeValues.includes(initialSettings.timeLimit);

  const [showCustomTimeInput, setShowCustomTimeInput] = useState(!!isInitialTimeCustom);

  const getInitialCustomTime = () => {
    if (isInitialTimeCustom && initialSettings) {
      const minutes = Math.floor(initialSettings.timeLimit / 60);
      const seconds = initialSettings.timeLimit % 60;
      return {
        minutes: minutes > 0 ? String(minutes) : '',
        seconds: seconds > 0 ? String(seconds) : '',
      };
    }
    return { minutes: '', seconds: '' };
  };

  const initialCustom = getInitialCustomTime();
  const [customMinutes, setCustomMinutes] = useState(initialCustom.minutes);
  const [customSeconds, setCustomSeconds] = useState(initialCustom.seconds);

  const numbers = operation === 'squares' || operation === 'square-roots'
    ? Array.from({ length: 20 }, (_, i) => i + 1)
    : operation === 'negative-numbers'
    ? Array.from({ length: 10 }, (_, i) => i + 1)
    : Array.from({ length: 12 }, (_, i) => i + 1);

  const operationRef = useRef(operation);
  useEffect(() => {
    if (operationRef.current === operation) return;
    operationRef.current = operation;
    setSelectedNumbers([]);
    const newMax = isConversionMode ? MAX_CONVERSION_QUESTION_COUNT : MAX_QUESTION_COUNT;
    setQuestionCount(prev => (prev > newMax ? newMax : prev));
  }, [operation, isConversionMode]);

  const needsAtLeastTen = (operation === 'squares' || operation === 'square-roots') && selectedNumbers.length > 0 && selectedNumbers.length < 10;

  const toggleNumber = (num: number) => {
    setSelectedNumbers(prev =>
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  const selectAll = () => {
    setSelectedNumbers(prev => (prev.length === numbers.length ? [] : numbers));
  };

  const handleTimeSelection = (value: number) => {
    setTimeLimit(value);
    setShowCustomTimeInput(false);
    setCustomMinutes('');
    setCustomSeconds('');
  };

  const handleCustomTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numericValue = value.replace(/[^0-9]/g, '').slice(0, 2);
    if (name === 'minutes') setCustomMinutes(numericValue);
    else if (name === 'seconds') setCustomSeconds(numericValue);
  };

  const handleStart = () => {
    if (selectedNumbers.length === 0 && !isConversionMode) return;
    let finalTimeLimit = timeLimit;
    if (showCustomTimeInput) {
      const mins = parseInt(customMinutes, 10) || 0;
      const secs = parseInt(customSeconds, 10) || 0;
      finalTimeLimit = mins * 60 + secs;
    }
    onStartQuiz(operation, selectedNumbers, finalTimeLimit, questionCount);
  };

  const opButtonClass = (active: boolean) =>
    `px-6 py-3 text-lg font-semibold rounded-lg transition-all duration-200 border-2 ${
      active
        ? 'bg-blue-600 text-white border-blue-600'
        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'
    }`;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 relative">
      <button
        onClick={toggleDarkMode}
        aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        className="absolute top-4 right-4 p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        {isDarkMode ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
      </button>

      <h1 className="text-4xl sm:text-5xl font-extrabold text-center text-slate-800 dark:text-white mb-2">Math Practice</h1>
      <p className="text-center text-slate-500 dark:text-slate-400 mb-6">Sharpen your skills. Select your challenge below.</p>

      <div className="flex justify-center mb-10">
        <Link
          to="/multiplayer"
          className="px-8 py-3 bg-linear-to-r from-purple-600 to-indigo-600 text-white font-bold text-lg rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 flex items-center gap-2"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Multiplayer Mode
        </Link>
      </div>

      <div className="space-y-8">
        <Section title="Pick Your Operation" step={1}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {operationButtons.map(({ op, label }) => (
              <button key={op} onClick={() => setOperation(op)} className={opButtonClass(operation === op)}>
                {label}
              </button>
            ))}
          </div>
        </Section>

        {!isConversionMode && (
          <Section title="Select Numbers" step={2}>
            <div className={`grid ${operation === 'squares' || operation === 'square-roots' ? 'grid-cols-5 sm:grid-cols-10' : 'grid-cols-4 sm:grid-cols-6'} gap-3 text-center`}>
              {numbers.map(num => (
                <button
                  key={num}
                  onClick={() => toggleNumber(num)}
                  aria-pressed={selectedNumbers.includes(num)}
                  aria-label={`Toggle number ${num}`}
                  className={`p-3 text-lg font-bold rounded-lg transition-transform duration-200 transform ease-bouncy border-2 ${
                    selectedNumbers.includes(num)
                      ? 'bg-blue-600 text-white border-blue-600 scale-105'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
            <p className="text-center text-slate-500 dark:text-slate-400 mt-4 italic text-sm">
              Note: To be eligible for the leaderboard, you must select all numbers.
            </p>
            {needsAtLeastTen && (
              <p className="text-center text-red-500 dark:text-red-400 mt-4 font-semibold animate-fade-in">
                Please select at least 10 numbers for this operation.
              </p>
            )}
            <div className="mt-4 flex justify-center">
              <button onClick={selectAll} className="px-6 py-2 font-semibold text-white bg-slate-600 dark:bg-slate-700 rounded-full hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors shadow-xs">
                {selectedNumbers.length === numbers.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </Section>
        )}

        <Section title="Set a Time Limit" step={isConversionMode ? 2 : 3}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {timeOptions.map(option => (
              <button
                key={option.value}
                onClick={() => handleTimeSelection(option.value)}
                className={`px-4 py-2 font-semibold rounded-lg transition-all duration-200 border-2 ${
                  timeLimit === option.value && !showCustomTimeInput
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'
                }`}
              >
                {option.label}
              </button>
            ))}
            <button
              onClick={() => setShowCustomTimeInput(true)}
              className={`px-4 py-2 font-semibold rounded-lg transition-all duration-200 border-2 ${
                showCustomTimeInput
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'
              }`}
            >
              Custom
            </button>
          </div>
          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${showCustomTimeInput ? 'max-h-24 opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'}`}>
            <div className="flex justify-center items-center gap-2">
              <label htmlFor="custom-minutes" className="sr-only">Minutes</label>
              <input
                id="custom-minutes"
                type="text"
                name="minutes"
                value={customMinutes}
                onChange={handleCustomTimeChange}
                placeholder="MM"
                className="w-20 p-2 text-center text-xl font-bold border-2 border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                maxLength={2}
                inputMode="numeric"
              />
              <span className="text-2xl font-bold text-slate-500" aria-hidden="true">:</span>
              <label htmlFor="custom-seconds" className="sr-only">Seconds</label>
              <input
                id="custom-seconds"
                type="text"
                name="seconds"
                value={customSeconds}
                onChange={handleCustomTimeChange}
                placeholder="SS"
                className="w-20 p-2 text-center text-xl font-bold border-2 border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                maxLength={2}
                inputMode="numeric"
              />
            </div>
          </div>
        </Section>

        <Section title="Number of Questions" step={isConversionMode ? 3 : 4}>
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setQuestionCount(prev => Math.max(MIN_QUESTION_COUNT, prev - 5))}
                disabled={questionCount <= MIN_QUESTION_COUNT}
                aria-label="Decrease question count"
                className="w-12 h-12 text-2xl font-bold rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                −
              </button>
              <div className="flex flex-col items-center">
                <label htmlFor="question-count" className="sr-only">Number of questions</label>
                <input
                  id="question-count"
                  type="range"
                  min={MIN_QUESTION_COUNT}
                  max={maxQuestions}
                  step={1}
                  value={questionCount}
                  onChange={e => setQuestionCount(parseInt(e.target.value, 10))}
                  className="w-48 sm:w-64 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="text-3xl font-bold text-slate-800 dark:text-slate-100 mt-2">{questionCount}</span>
              </div>
              <button
                onClick={() => setQuestionCount(prev => Math.min(maxQuestions, prev + 5))}
                disabled={questionCount >= maxQuestions}
                aria-label="Increase question count"
                className="w-12 h-12 text-2xl font-bold rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              {[5, 10, 15, 20, 25].filter(n => n <= maxQuestions).map(num => (
                <button
                  key={num}
                  onClick={() => setQuestionCount(num)}
                  className={`px-4 py-2 font-semibold rounded-lg transition-all duration-200 border-2 ${
                    questionCount === num
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'
                  }`}
                >
                  {num}
                </button>
              ))}
              {!isConversionMode && [30, 40, 50].map(num => (
                <button
                  key={num}
                  onClick={() => setQuestionCount(num)}
                  className={`px-4 py-2 font-semibold rounded-lg transition-all duration-200 border-2 ${
                    questionCount === num
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
            {questionCount !== DEFAULT_QUESTION_COUNT && isLeaderboardOperation && (
              <p className="text-center text-amber-600 dark:text-amber-400 font-semibold text-sm animate-fade-in">
                ⚠️ To qualify for the leaderboard, you must use {DEFAULT_QUESTION_COUNT} questions.
              </p>
            )}
          </div>
        </Section>
      </div>

      <div className="mt-12 text-center">
        <button
          onClick={handleStart}
          disabled={(selectedNumbers.length === 0 && !isConversionMode) || needsAtLeastTen}
          className="w-full sm:w-auto px-16 py-4 text-xl font-bold text-white bg-blue-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 disabled:bg-slate-400 dark:disabled:bg-slate-600"
        >
          Start Quiz
        </button>
      </div>
      <div className="mt-10 border-t border-slate-200 dark:border-slate-800 pt-6 flex justify-center">
        <button onClick={() => setShowStats(prev => !prev)} className="px-6 py-2 font-semibold text-white bg-slate-600 dark:bg-slate-700 rounded-full hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors shadow-xs flex items-center gap-2">
          <ChartBarIcon className="w-5 h-5" />
          {showStats ? 'Hide Progress' : 'View Progress'}
        </button>
      </div>

      {showStats && <StatisticsDisplay />}
      <GlobalLeaderboard />
      <HallOfFameDisplay />
      <HighScoresDisplay />
    </div>
  );
};
