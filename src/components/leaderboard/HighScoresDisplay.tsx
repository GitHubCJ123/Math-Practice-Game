import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { HighScore, HighScores } from '@shared/types';
import { TrashIcon } from '../ui/icons';
import { logger } from '../../lib/logger';

export const HighScoresDisplay: React.FC = () => {
  const [highScores, setHighScores] = useState<HighScores | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem('mathWhizHighScores');
      setHighScores(raw ? JSON.parse(raw) : null);
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

  const handleClear = () => {
    if (confirmingClear) {
      localStorage.removeItem('mathWhizHighScores');
      refresh();
      setConfirmingClear(false);
    } else {
      setConfirmingClear(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setConfirmingClear(false), 3000);
    }
  };

  if (!highScores || Object.keys(highScores).length === 0) {
    return (
      <div className="mt-10 p-6 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 animate-fade-in">
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-4 text-center">🏆 Personal Bests</h2>
        <p className="text-center text-slate-500 dark:text-slate-400">No high scores yet. Be the first to set one!</p>
      </div>
    );
  }

  const sorted = Object.entries(highScores).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="mt-10 p-6 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">🏆 Personal Bests</h2>
        <button
          onClick={handleClear}
          aria-label={confirmingClear ? 'Confirm clearing personal bests' : 'Clear personal bests'}
          className={`flex items-center gap-1.5 px-3 py-1 text-sm font-semibold rounded-full transition-colors ${
            confirmingClear
              ? 'bg-red-600 text-white'
              : 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/10 hover:bg-red-200 dark:hover:bg-red-500/20'
          }`}
        >
          <TrashIcon className="w-4 h-4" />
          {confirmingClear ? 'Confirm Clear' : 'Clear All'}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sorted.map(([key, score]) => {
          const hs = score as HighScore;
          return (
            <div key={key} className="p-3 bg-white dark:bg-slate-900 rounded-lg flex justify-between items-center border border-slate-200 dark:border-slate-700">
              <div>
                <p className="font-semibold text-md text-blue-600 dark:text-blue-400 capitalize">{key}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-lg text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  {hs.score} / 10
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{hs.time}s</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
