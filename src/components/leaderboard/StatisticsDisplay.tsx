import React, { useCallback, useEffect, useState } from 'react';
import type { Operation, AllQuizStats, QuizStats, HighScores, HighScore } from '@shared/types';
import { BullseyeIcon, ClockIcon, ListBulletIcon, TrashIcon, TrophyIcon, ChartBarIcon, ChevronDownIcon } from '../ui/icons';
import { ALL_OPERATIONS, OPERATION_TINTS, OPERATION_SYMBOLS, getOperationDisplayName } from '../../lib/operations';
import { logger } from '../../lib/logger';

const STATS_KEY = 'mathWhizStats';
const HIGH_SCORES_KEY = 'mathWhizHighScores';

const StatCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: string | React.ReactNode;
  footer: string;
  highlight?: boolean;
}> = ({ icon, title, value, footer, highlight }) => (
  <div
    className={`flex flex-col justify-between p-3.5 rounded-2xl border ${
      highlight
        ? 'border-transparent bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-orange-500/25'
        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60'
    }`}
  >
    <div className={`flex items-center gap-1.5 ${highlight ? 'text-white/90' : 'text-slate-500 dark:text-slate-400'}`}>
      {icon}
      <h4 className="font-display text-[0.7rem] font-bold uppercase tracking-wide">{title}</h4>
    </div>
    <p className={`font-display text-2xl font-bold my-1 ${highlight ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>
      {value}
    </p>
    <p className={`text-xs font-medium ${highlight ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>{footer}</p>
  </div>
);

export const StatisticsDisplay: React.FC = () => {
  const [stats, setStats] = useState<AllQuizStats | null>(null);
  const [highScores, setHighScores] = useState<HighScores | null>(null);
  const [confirmingClear, setConfirmingClear] = useState<Operation | null>(null);
  const [expanded, setExpanded] = useState<Set<Operation>>(() => new Set());
  const timerRef = React.useRef<number | null>(null);

  const refresh = useCallback(() => {
    try {
      const rawStats = localStorage.getItem(STATS_KEY);
      setStats(rawStats ? JSON.parse(rawStats) : null);
    } catch (error) {
      logger.error('Failed to load stats:', error);
      setStats(null);
    }
    try {
      const rawScores = localStorage.getItem(HIGH_SCORES_KEY);
      setHighScores(rawScores ? JSON.parse(rawScores) : null);
    } catch (error) {
      logger.error('Failed to load high scores:', error);
      setHighScores(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const clearOperation = (operation: Operation) => {
    // Remove this operation's progress stats and personal best together.
    try {
      const rawStats = localStorage.getItem(STATS_KEY);
      const allStats: AllQuizStats = rawStats ? JSON.parse(rawStats) : {};
      if (allStats[operation]) {
        delete allStats[operation];
        if (Object.keys(allStats).length === 0) {
          localStorage.removeItem(STATS_KEY);
        } else {
          localStorage.setItem(STATS_KEY, JSON.stringify(allStats));
        }
      }
    } catch (error) {
      logger.error('Failed to clear stats:', error);
    }
    try {
      const rawScores = localStorage.getItem(HIGH_SCORES_KEY);
      const scores: HighScores = rawScores ? JSON.parse(rawScores) : {};
      if (scores[operation]) {
        delete scores[operation];
        if (Object.keys(scores).length === 0) {
          localStorage.removeItem(HIGH_SCORES_KEY);
        } else {
          localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(scores));
        }
      }
    } catch (error) {
      logger.error('Failed to clear high score:', error);
    }
    refresh();
  };

  const handleClearClick = (operation: Operation) => {
    if (confirmingClear === operation) {
      clearOperation(operation);
      setConfirmingClear(null);
    } else {
      setConfirmingClear(operation);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setConfirmingClear(currentOp => (currentOp === operation ? null : currentOp));
      }, 3000);
    }
  };

  const toggleExpanded = (operation: Operation) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(operation)) {
        next.delete(operation);
      } else {
        next.add(operation);
      }
      return next;
    });
  };

  const renderOperation = (operation: Operation, data: QuizStats | undefined, best: HighScore | undefined) => {
    const totalQuizzes = data?.totalQuizzes ?? 0;
    const totalCorrect = data?.totalCorrect ?? 0;
    const accuracy = totalQuizzes > 0 ? ((totalCorrect / (totalQuizzes * 10)) * 100).toFixed(1) : '0.0';
    const avgTime = totalQuizzes > 0 ? ((data?.totalTime ?? 0) / totalQuizzes).toFixed(1) : '0.0';
    const topNumbers = data
      ? Object.entries(data.numberFrequency)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([num]) => num)
      : [];

    const hasData = !!data || !!best;
    const isConfirming = confirmingClear === operation;
    const isExpanded = expanded.has(operation);

    return (
      <div
        key={operation}
        className="rounded-3xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 shadow-sm overflow-hidden"
      >
        <button
          type="button"
          onClick={() => toggleExpanded(operation)}
          aria-expanded={isExpanded}
          className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`grid place-items-center w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br ${OPERATION_TINTS[operation]} text-white font-display font-bold text-base shadow-sm`}
            >
              {OPERATION_SYMBOLS[operation]}
            </span>
            <h3 className="font-display text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 truncate">
              {getOperationDisplayName(operation)}
            </h3>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {best ? (
              <span className="flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                <TrophyIcon className="w-3.5 h-3.5" />
                {best.score}/10
              </span>
            ) : (
              <span className="hidden sm:inline text-xs font-medium text-slate-400 dark:text-slate-500">Not played yet</span>
            )}
            <ChevronDownIcon
              className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
              <StatCard
                icon={<TrophyIcon className="w-4 h-4" />}
                title="Personal Best"
                value={best ? `${best.score}/10` : '—'}
                footer={best ? `in ${best.time}s` : 'No record yet'}
                highlight={!!best}
              />
              <StatCard
                icon={<BullseyeIcon className="w-4 h-4" />}
                title="Accuracy"
                value={`${accuracy}%`}
                footer={`${totalCorrect} correct answers`}
              />
              <StatCard
                icon={<ClockIcon className="w-4 h-4" />}
                title="Avg. Time"
                value={`${avgTime}s`}
                footer={`Across ${totalQuizzes} quiz${totalQuizzes !== 1 ? 'zes' : ''}`}
              />
              <StatCard
                icon={<ListBulletIcon className="w-4 h-4" />}
                title="Top Numbers"
                value={
                  topNumbers.length > 0 ? (
                    <div className="flex gap-1.5">
                      {topNumbers.map(num => (
                        <span
                          key={num}
                          className="flex items-center justify-center h-9 w-9 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 rounded-full font-display font-bold text-lg"
                        >
                          {num}
                        </span>
                      ))}
                    </div>
                  ) : (
                    '—'
                  )
                }
                footer={topNumbers.length > 0 ? 'Most practiced' : 'No data yet'}
              />
            </div>

            {hasData ? (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => handleClearClick(operation)}
                  aria-label={isConfirming ? `Confirm clearing ${operation} progress` : `Clear ${operation} progress`}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs sm:text-sm font-semibold rounded-full transition-colors ${
                    isConfirming
                      ? 'bg-red-600 text-white'
                      : 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/10 hover:bg-red-200 dark:hover:bg-red-500/20'
                  }`}
                >
                  <TrashIcon className="w-4 h-4" />
                  {isConfirming ? 'Confirm Clear' : 'Clear'}
                </button>
              </div>
            ) : (
              <p className="mt-3 text-center text-sm text-slate-400 dark:text-slate-500">
                No data yet — play a {getOperationDisplayName(operation)} quiz to see your stats here.
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mt-6 animate-fade-in">
      <div className="flex items-center justify-center gap-2 mb-5">
        <ChartBarIcon className="w-6 h-6 text-violet-500 dark:text-violet-400" />
        <h2 className="font-display text-2xl font-bold text-slate-800 dark:text-slate-100">Your Progress</h2>
      </div>

      <div className="space-y-3">
        {ALL_OPERATIONS.map(op => renderOperation(op, stats?.[op], highScores?.[op]))}
      </div>
    </div>
  );
};
