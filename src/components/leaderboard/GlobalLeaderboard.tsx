import React, { useCallback, useEffect, useState } from 'react';
import type { Operation } from '@shared/types';
import { ALL_OPERATIONS, getOperationDisplayName } from '../../lib/operations';
import { Leaderboard } from '../ui/Leaderboard';
import { logger } from '../../lib/logger';

interface Score {
  playerName: string;
  score: number;
}

export const GlobalLeaderboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Operation>('multiplication');
  const [scores, setScores] = useState<Score[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const timerId = setInterval(() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const endDate = new Date(year, month + 1, 0, 23, 59, 59);
      const diff = endDate.getTime() - now.getTime();
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft({ days, hours, minutes, seconds });
    }, 1000);
    return () => clearInterval(timerId);
  }, []);

  const fetchScores = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/get-leaderboard?operationType=${activeTab}`);
      if (!response.ok) throw new Error('Failed to fetch scores');
      setScores(await response.json());
    } catch (error) {
      logger.error('Error fetching leaderboard:', error);
      setScores([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  return (
    <div className="mt-10 p-6 bg-slate-50 dark:bg-slate-800/40 rounded-3xl border border-slate-200 dark:border-slate-700/60 animate-fade-in">
      <div className="flex flex-col items-center text-center mb-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2">
            🏆 Global Leaderboards
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
            See how you stack up against other players this month.
          </p>
        </div>
        <div className="mt-4">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Resets In</div>
          <div className="flex gap-2 justify-center text-violet-600 dark:text-violet-400">
            <div>
              <div className="font-bold text-lg tabular-nums">{String(timeLeft.days).padStart(2, '0')}</div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Days</div>
            </div>
            <div>
              <div className="font-bold text-lg tabular-nums">{String(timeLeft.hours).padStart(2, '0')}</div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Hours</div>
            </div>
            <div>
              <div className="font-bold text-lg tabular-nums">{String(timeLeft.minutes).padStart(2, '0')}</div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Mins</div>
            </div>
            <div>
              <div className="font-bold text-lg tabular-nums">{String(timeLeft.seconds).padStart(2, '0')}</div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Secs</div>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">The leaderboard resets every month.</p>
        </div>
      </div>
      <div className="flex justify-center mb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="-mb-px flex flex-wrap justify-center gap-x-4" aria-label="Tabs">
          {ALL_OPERATIONS.map(op => (
            <button
              key={op}
              onClick={() => setActiveTab(op)}
              className={`${
                activeTab === op
                  ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              } whitespace-nowrap py-2 px-1 border-b-2 font-display font-semibold text-sm transition-colors`}
            >
              {getOperationDisplayName(op)}
            </button>
          ))}
        </div>
      </div>
      <Leaderboard
        title={getOperationDisplayName(activeTab)}
        scores={scores}
        isLoading={isLoading}
        subtitle="Scores for the current month"
      />
    </div>
  );
};
