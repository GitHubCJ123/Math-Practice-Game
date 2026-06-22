import React, { useEffect, useState } from 'react';
import type { Operation } from '@shared/types';
import { ALL_OPERATIONS, getOperationDisplayName } from '../../lib/operations';
import { logger } from '../../lib/logger';

interface Score {
  playerName: string;
  score: number;
}

const MONTHS = [
  { value: 1, name: 'January' }, { value: 2, name: 'February' }, { value: 3, name: 'March' },
  { value: 4, name: 'April' }, { value: 5, name: 'May' }, { value: 6, name: 'June' },
  { value: 7, name: 'July' }, { value: 8, name: 'August' }, { value: 9, name: 'September' },
  { value: 10, name: 'October' }, { value: 11, name: 'November' }, { value: 12, name: 'December' },
];

export const HallOfFameDisplay: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [availableDates, setAvailableDates] = useState<{ [year: number]: number[] }>({});
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [monthlyChampions, setMonthlyChampions] = useState<Partial<Record<Operation, Score | null>>>({});

  useEffect(() => {
    const fetchDates = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/get-hall-of-fame?view=dates');
        if (!response.ok) throw new Error('Failed to fetch dates');
        const data = await response.json();
        setAvailableDates(data);
        const years = Object.keys(data).map(Number).sort((a, b) => b - a);
        if (years.length > 0) {
          const latestYear = years[0];
          const latestMonth = data[latestYear][0];
          setSelectedYear(latestYear);
          setSelectedMonth(latestMonth);
        }
      } catch (error) {
        logger.error('Error fetching hall of fame dates:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDates();
  }, []);

  useEffect(() => {
    if (!selectedYear || !selectedMonth) return;
    const fetchAll = async () => {
      setIsLoading(true);
      const champions: Partial<Record<Operation, Score | null>> = {};
      for (const op of ALL_OPERATIONS) {
        try {
          const response = await fetch(`/api/get-hall-of-fame?operationType=${op}&year=${selectedYear}&month=${selectedMonth}`);
          if (response.ok) {
            const data = await response.json();
            champions[op] = data.length > 0 ? data[0] : null;
          } else {
            champions[op] = null;
          }
        } catch (error) {
          logger.error(`Error fetching hall of fame for ${op}:`, error);
          champions[op] = null;
        }
      }
      setMonthlyChampions(champions);
      setIsLoading(false);
    };
    fetchAll();
  }, [selectedYear, selectedMonth]);

  const availableYears = Object.keys(availableDates).map(Number).sort((a, b) => b - a);
  const availableMonthsForYear = selectedYear ? availableDates[selectedYear] : [];

  if (availableYears.length === 0) {
    return (
      <div className="mt-10 p-6 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 animate-fade-in">
        <div className="flex flex-col items-center text-center mb-4">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2">
            🏛️ Hall of Fame
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
            No Hall of Fame records have been created yet. Check back next month!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-10 p-6 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 animate-fade-in">
      <div className="flex flex-col items-center text-center mb-4">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2">
          🏛️ Hall of Fame
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
          View the top player for each operation from previous months.
        </p>
        <div className="flex justify-center gap-4 my-4">
          <label htmlFor="hof-year" className="sr-only">Year</label>
          <select
            id="hof-year"
            value={selectedYear || ''}
            onChange={e => {
              const year = parseInt(e.target.value, 10);
              setSelectedYear(year);
              setSelectedMonth(availableDates[year][0]);
            }}
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
          >
            {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
          <label htmlFor="hof-month" className="sr-only">Month</label>
          <select
            id="hof-month"
            value={selectedMonth || ''}
            onChange={e => setSelectedMonth(parseInt(e.target.value, 10))}
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
          >
            {availableMonthsForYear.map(monthValue => {
              const monthName = MONTHS.find(m => m.value === monthValue)?.name;
              return <option key={monthValue} value={monthValue}>{monthName}</option>;
            })}
          </select>
        </div>
        {selectedYear === 2025 && selectedMonth === 10 && (
          <div className="text-center bg-yellow-100 dark:bg-yellow-900/50 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200 px-4 py-3 rounded-lg relative mb-4" role="alert">
            <strong className="font-bold">Note:</strong>
            <span className="block sm:inline"> During this month (October 2025), the leaderboard was in testing. Scores may be incorrect or inaccurate.</span>
          </div>
        )}
      </div>
      {isLoading ? (
        <div className="text-center text-gray-500 dark:text-gray-400">Loading Champions...</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {ALL_OPERATIONS.map(op => {
            const champion = monthlyChampions[op];
            return (
              <div key={op} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                <h4 className="font-display font-bold text-violet-600 dark:text-violet-400 capitalize">{getOperationDisplayName(op)}</h4>
                {champion ? (
                  <>
                    <p className="font-display text-lg font-semibold text-slate-800 dark:text-slate-100">{champion.playerName}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{(champion.score / 1000).toFixed(3)}s</p>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">N/A</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
