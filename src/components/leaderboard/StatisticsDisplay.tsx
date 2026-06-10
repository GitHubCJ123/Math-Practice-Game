import React, { useCallback, useEffect, useState } from 'react';
import type { Operation, AllQuizStats, QuizStats } from '@shared/types';
import { BullseyeIcon, ClockIcon, ListBulletIcon, TrashIcon } from '../ui/icons';
import { logger } from '../../lib/logger';

const StatCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: string | React.ReactNode;
  footer: string;
}> = ({ icon, title, value, footer }) => (
  <div className="flex flex-col justify-between p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700">
    <div>
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        {icon}
        <h4 className="font-display font-semibold">{title}</h4>
      </div>
      <p className="font-display text-3xl font-bold text-slate-800 dark:text-slate-100 my-2">{value}</p>
    </div>
    <p className="text-sm text-slate-500 dark:text-slate-400">{footer}</p>
  </div>
);

export const StatisticsDisplay: React.FC = () => {
  const [stats, setStats] = useState<AllQuizStats | null>(null);
  const [confirmingClear, setConfirmingClear] = useState<Operation | null>(null);
  const timerRef = React.useRef<number | null>(null);

  const refreshStats = useCallback(() => {
    try {
      const raw = localStorage.getItem('mathWhizStats');
      setStats(raw ? JSON.parse(raw) : null);
    } catch (error) {
      logger.error('Failed to load stats:', error);
      setStats(null);
    }
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const renderStatSection = (operation: Operation, data: QuizStats) => {
    const accuracy = data.totalQuizzes > 0 ? ((data.totalCorrect / (data.totalQuizzes * 10)) * 100).toFixed(1) : '0.0';
    const avgTime = data.totalQuizzes > 0 ? (data.totalTime / data.totalQuizzes).toFixed(1) : '0.0';
    const topNumbers = Object.entries(data.numberFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([num]) => num);

    const isConfirming = confirmingClear === operation;

    const handleClearClick = () => {
      if (isConfirming) {
        const raw = localStorage.getItem('mathWhizStats');
        const current: AllQuizStats = raw ? JSON.parse(raw) : {};
        if (!current || !current[operation]) return;
        const next = { ...current };
        delete next[operation];
        if (Object.keys(next).length === 0) {
          localStorage.removeItem('mathWhizStats');
        } else {
          localStorage.setItem('mathWhizStats', JSON.stringify(next));
        }
        refreshStats();
        setConfirmingClear(null);
      } else {
        setConfirmingClear(operation);
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          setConfirmingClear(currentOp => (currentOp === operation ? null : currentOp));
        }, 3000);
      }
    };

    return (
      <div key={operation}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-display text-lg font-bold text-slate-700 dark:text-slate-200 capitalize">{operation}</h3>
          <button
            onClick={handleClearClick}
            aria-label={isConfirming ? `Confirm clearing ${operation} progress` : `Clear ${operation} progress`}
            className={`flex items-center gap-1.5 px-3 py-1 text-sm font-semibold rounded-full transition-colors ${
              isConfirming
                ? 'bg-red-600 text-white'
                : 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/10 hover:bg-red-200 dark:hover:bg-red-500/20'
            }`}
          >
            <TrashIcon className="w-4 h-4" />
            {isConfirming ? 'Confirm Clear' : 'Clear Progress'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            icon={<BullseyeIcon className="w-5 h-5" />}
            title="Accuracy"
            value={`${accuracy}%`}
            footer={`${data.totalCorrect} correct answers`}
          />
          <StatCard
            icon={<ClockIcon className="w-5 h-5" />}
            title="Avg. Time"
            value={`${avgTime}s`}
            footer={`Across ${data.totalQuizzes} quiz${data.totalQuizzes !== 1 ? 'zes' : ''}`}
          />
          <StatCard
            icon={<ListBulletIcon className="w-5 h-5" />}
            title="Top Numbers"
            value={
              topNumbers.length > 0 ? (
                <div className="flex gap-2">
                  {topNumbers.map(num => (
                    <span key={num} className="flex items-center justify-center h-10 w-10 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 rounded-full font-display font-bold text-xl">
                      {num}
                    </span>
                  ))}
                </div>
              ) : (
                '-'
              )
            }
            footer={topNumbers.length > 0 ? 'Most practiced' : 'No data yet'}
          />
        </div>
      </div>
    );
  };

  if (!stats || Object.keys(stats).length === 0) return null;

  return (
    <div className="mt-6 p-6 bg-slate-50 dark:bg-slate-800/40 rounded-3xl border border-slate-200 dark:border-slate-700/60 animate-fade-in">
      <h2 className="font-display text-xl font-bold text-slate-800 dark:text-slate-100 mb-4 text-center">📊 Your Progress</h2>
      <div className="space-y-6">
        {Object.entries(stats).map(([op, data]) => renderStatSection(op as Operation, data as QuizStats))}
      </div>
    </div>
  );
};
