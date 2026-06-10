import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Operation } from '@shared/types';
import {
  DEFAULT_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
  MAX_CONVERSION_QUESTION_COUNT,
} from '@shared/types';
import {
  ChartBarIcon,
  MoonIcon,
  SunIcon,
  BrandMark,
  PlayIcon,
  UsersIcon,
  SparklesIcon,
} from '../ui/icons';
import { playClickSound } from '../../lib/audio';
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
      <div className="flex items-center justify-center w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white font-display font-bold shadow-md shadow-fuchsia-500/30">
        {step}
      </div>
      <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">{title}</h2>
    </div>
    {children}
  </div>
);

const operationCards: { op: Operation; label: string; glyph: React.ReactNode; tint: string }[] = [
  { op: 'multiplication', label: 'Multiplication', glyph: '×', tint: 'from-violet-500 to-purple-600' },
  { op: 'division', label: 'Division', glyph: '÷', tint: 'from-sky-500 to-blue-600' },
  { op: 'squares', label: 'Squares', glyph: <>x<sup>2</sup></>, tint: 'from-emerald-500 to-teal-600' },
  { op: 'square-roots', label: 'Square Roots', glyph: '√', tint: 'from-amber-500 to-orange-600' },
  { op: 'fraction-to-decimal', label: 'Fraction → Decimal', glyph: '½', tint: 'from-fuchsia-500 to-pink-600' },
  { op: 'decimal-to-fraction', label: 'Decimal → Fraction', glyph: '.5', tint: 'from-pink-500 to-rose-600' },
  { op: 'fraction-to-percent', label: 'Fraction → Percent', glyph: '%', tint: 'from-cyan-500 to-sky-600' },
  { op: 'percent-to-fraction', label: 'Percent → Fraction', glyph: '%', tint: 'from-indigo-500 to-violet-600' },
  { op: 'negative-numbers', label: 'Negative Numbers', glyph: '±', tint: 'from-rose-500 to-red-600' },
];

const SELECTIONS_BY_OP_KEY = 'mathSelectionsByOp';

const loadSelectionsByOp = (): Partial<Record<Operation, number[]>> => {
  try {
    const raw = localStorage.getItem(SELECTIONS_BY_OP_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveSelectionsByOp = (map: Partial<Record<Operation, number[]>>) => {
  try {
    localStorage.setItem(SELECTIONS_BY_OP_KEY, JSON.stringify(map));
  } catch {
    /* ignore storage errors */
  }
};

export const SelectionScreen: React.FC<SelectionScreenProps> = ({ onStartQuiz, initialSettings, isDarkMode, toggleDarkMode }) => {
  const initialOperation: Operation = initialSettings?.operation || 'multiplication';
  const [operation, setOperation] = useState<Operation>(initialOperation);
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>(() => {
    if (initialSettings?.selectedNumbers && initialSettings.selectedNumbers.length > 0) {
      return initialSettings.selectedNumbers;
    }
    return loadSelectionsByOp()[initialOperation] ?? [];
  });
  const [timeLimit, setTimeLimit] = useState<number>(initialSettings?.timeLimit ?? 0);
  const [questionCount, setQuestionCount] = useState<number>(initialSettings?.questionCount ?? DEFAULT_QUESTION_COUNT);
  const [showStats, setShowStats] = useState(false);

  // Remembers the numbers chosen for each operation so returning to an
  // operation restores its selection, while a fresh operation starts empty.
  // Persisted to localStorage so it survives navigation and reloads.
  const selectionsByOpRef = useRef<Partial<Record<Operation, number[]>>>(null as never);
  if (selectionsByOpRef.current === (null as never)) {
    const stored = loadSelectionsByOp();
    if (initialSettings?.selectedNumbers && initialSettings.selectedNumbers.length > 0) {
      stored[initialSettings.operation] = initialSettings.selectedNumbers;
    }
    selectionsByOpRef.current = stored;
  }

  const rememberSelection = (op: Operation, nums: number[]) => {
    selectionsByOpRef.current[op] = nums;
    saveSelectionsByOp(selectionsByOpRef.current);
  };

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
    // Restore this operation's remembered selection (empty for a fresh one).
    setSelectedNumbers(selectionsByOpRef.current[operation] ?? []);
    const newMax = isConversionMode ? MAX_CONVERSION_QUESTION_COUNT : MAX_QUESTION_COUNT;
    setQuestionCount(prev => (prev > newMax ? newMax : prev));
  }, [operation, isConversionMode]);

  const needsAtLeastTen = (operation === 'squares' || operation === 'square-roots') && selectedNumbers.length > 0 && selectedNumbers.length < 10;

  const toggleNumber = (num: number) => {
    setSelectedNumbers(prev => {
      const next = prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num];
      rememberSelection(operation, next);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedNumbers(prev => {
      const next = prev.length === numbers.length ? [] : numbers;
      rememberSelection(operation, next);
      return next;
    });
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

  const canStart = (selectedNumbers.length > 0 || isConversionMode) && !needsAtLeastTen;
  const isSquareMode = operation === 'squares' || operation === 'square-roots';

  return (
    <div className="game-panel w-full max-w-4xl mx-auto p-5 sm:p-7 lg:p-9 relative animate-fade-in">
      <button
        onClick={toggleDarkMode}
        aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        className="absolute top-4 right-4 z-10 grid place-items-center w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-amber-500 dark:text-sky-300 border border-slate-200 dark:border-slate-700 hover:scale-110 active:scale-95 transition-transform shadow-sm"
      >
        {isDarkMode ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
      </button>

      <div className="flex flex-col items-center text-center mb-7 pt-2">
        <div className="flex items-center gap-3">
          <BrandMark className="w-11 h-11 sm:w-14 sm:h-14 animate-float drop-shadow-lg" />
          <h1 className="font-display text-4xl sm:text-6xl font-bold text-gradient leading-none pb-1">Math Practice</h1>
        </div>
        <p className="mt-3 text-slate-500 dark:text-slate-400 font-semibold">
          Sharpen your skills — pick a challenge and go!
        </p>
      </div>

      <div className="flex justify-center mb-10">
        <Link to="/multiplayer" className="btn3d btn3d--party px-7 sm:px-8 py-3.5 text-lg">
          <UsersIcon className="w-6 h-6" />
          Multiplayer Mode
          <SparklesIcon className="w-5 h-5" />
        </Link>
      </div>

      <div className="space-y-9">
        <Section title="Pick Your Operation" step={1}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {operationCards.map(({ op, label, glyph, tint }) => (
              <button
                key={op}
                onClick={() => {
                  setOperation(op);
                  playClickSound();
                }}
                aria-pressed={operation === op}
                className={`opcard flex flex-col items-center justify-center gap-2 p-3 text-center min-h-[104px] ${operation === op ? 'opcard--active' : ''}`}
              >
                <span
                  className={`grid place-items-center w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br ${tint} text-white font-display font-bold text-2xl shadow-md`}
                >
                  {glyph}
                </span>
                <span className="font-display font-semibold text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-tight text-center">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </Section>

        {!isConversionMode && (
          <Section title="Select Numbers" step={2}>
            <div className={`grid ${isSquareMode ? 'grid-cols-5 sm:grid-cols-10' : 'grid-cols-6 sm:grid-cols-12'} gap-2 text-center`}>
              {numbers.map(num => (
                <button
                  key={num}
                  onClick={() => {
                    toggleNumber(num);
                    playClickSound();
                  }}
                  aria-pressed={selectedNumbers.includes(num)}
                  aria-label={`Toggle number ${num}`}
                  className="tile h-10 sm:h-11 text-sm sm:text-base"
                >
                  {num}
                </button>
              ))}
            </div>
            <p className="text-center text-slate-500 dark:text-slate-400 mt-4 italic text-sm">
              Tip: select <span className="font-semibold text-slate-600 dark:text-slate-300">all</span> numbers to be eligible for the leaderboard.
            </p>
            {needsAtLeastTen && (
              <p className="text-center text-rose-500 dark:text-rose-400 mt-3 font-bold animate-shake">
                Please select at least 10 numbers for this operation.
              </p>
            )}
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => {
                  selectAll();
                  playClickSound();
                }}
                className="btn3d btn3d--neutral px-6 py-2.5 text-sm"
              >
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
                onClick={() => {
                  handleTimeSelection(option.value);
                  playClickSound();
                }}
                className={`seg px-4 py-2.5 ${timeLimit === option.value && !showCustomTimeInput ? 'seg--active' : ''}`}
              >
                {option.label}
              </button>
            ))}
            <button
              onClick={() => setShowCustomTimeInput(true)}
              className={`seg px-4 py-2.5 ${showCustomTimeInput ? 'seg--active' : ''}`}
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
                className="w-20 p-2 text-center text-xl font-display font-bold border-2 border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                maxLength={2}
                inputMode="numeric"
              />
              <span className="text-2xl font-bold text-slate-400" aria-hidden="true">:</span>
              <label htmlFor="custom-seconds" className="sr-only">Seconds</label>
              <input
                id="custom-seconds"
                type="text"
                name="seconds"
                value={customSeconds}
                onChange={handleCustomTimeChange}
                placeholder="SS"
                className="w-20 p-2 text-center text-xl font-display font-bold border-2 border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                maxLength={2}
                inputMode="numeric"
              />
            </div>
          </div>
        </Section>

        <Section title="Number of Questions" step={isConversionMode ? 3 : 4}>
          <div className="flex flex-col items-center gap-5">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setQuestionCount(prev => Math.max(MIN_QUESTION_COUNT, prev - 5))}
                disabled={questionCount <= MIN_QUESTION_COUNT}
                aria-label="Decrease question count"
                className="tile w-12 h-12 text-2xl disabled:opacity-40 disabled:cursor-not-allowed"
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
                  className="range-fun w-52 sm:w-72 cursor-pointer"
                />
                <span className="font-display text-4xl font-bold text-slate-800 dark:text-slate-100 mt-3">{questionCount}</span>
              </div>
              <button
                onClick={() => setQuestionCount(prev => Math.min(maxQuestions, prev + 5))}
                disabled={questionCount >= maxQuestions}
                aria-label="Increase question count"
                className="tile w-12 h-12 text-2xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              {[5, 10, 15, 20, 25].filter(n => n <= maxQuestions).map(num => (
                <button
                  key={num}
                  onClick={() => setQuestionCount(num)}
                  className={`seg px-4 py-2 ${questionCount === num ? 'seg--active' : ''}`}
                >
                  {num}
                </button>
              ))}
              {!isConversionMode && [30, 40, 50].map(num => (
                <button
                  key={num}
                  onClick={() => setQuestionCount(num)}
                  className={`seg px-4 py-2 ${questionCount === num ? 'seg--active' : ''}`}
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
          disabled={!canStart}
          className="btn3d btn3d--success w-full sm:w-auto px-16 py-4 text-xl"
        >
          <PlayIcon className="w-6 h-6" />
          Start Quiz
        </button>
      </div>
      <div className="mt-10 border-t border-slate-200 dark:border-slate-800 pt-6 flex justify-center">
        <button onClick={() => setShowStats(prev => !prev)} className="btn3d btn3d--neutral px-6 py-2.5 text-sm">
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
