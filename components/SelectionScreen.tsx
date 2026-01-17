import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { Operation, HighScores, HighScore, AllQuizStats, QuizStats } from '../types';
import { DEFAULT_QUESTION_COUNT, MIN_QUESTION_COUNT, MAX_QUESTION_COUNT, MAX_CONVERSION_QUESTION_COUNT } from '../types';
import { StarIcon, SunIcon, MoonIcon, ChartBarIcon, BullseyeIcon, ListBulletIcon, ClockIcon, TrashIcon } from './icons';
import { Leaderboard } from './Leaderboard';

// Multiplayer launch date: January 22, 2026, 6:00 PM EST
const MULTIPLAYER_LAUNCH_DATE = new Date('2026-01-22T18:00:00-05:00');
const SECRET_CODE = 'multiplayeradmin67';

// Countdown Banner Component
const CountdownBanner: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const target = MULTIPLAYER_LAUNCH_DATE.getTime();
      const difference = target - now;

      if (difference <= 0) {
        return null;
      }

      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((difference % (1000 * 60)) / 1000),
      };
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (!timeLeft) return null;

  return (
    <div className="w-full mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 p-1 shadow-2xl">
      <div className="relative bg-gradient-to-r from-purple-900/90 via-indigo-900/90 to-blue-900/90 rounded-xl px-4 py-4 sm:px-6 sm:py-5">
        {/* Sparkle effects */}
        <div className="absolute inset-0 overflow-hidden rounded-xl">
          <div className="absolute top-2 left-[10%] w-2 h-2 bg-white rounded-full animate-ping opacity-75" />
          <div className="absolute top-4 left-[30%] w-1.5 h-1.5 bg-yellow-300 rounded-full animate-ping opacity-75" style={{ animationDelay: '0.3s' }} />
          <div className="absolute bottom-3 left-[60%] w-2 h-2 bg-pink-300 rounded-full animate-ping opacity-75" style={{ animationDelay: '0.6s' }} />
          <div className="absolute top-3 right-[20%] w-1.5 h-1.5 bg-cyan-300 rounded-full animate-ping opacity-75" style={{ animationDelay: '0.9s' }} />
        </div>
        
        <div className="relative flex flex-col sm:flex-row items-center justify-center gap-4 text-white">
          {/* Icon and Title */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-full">
              <svg className="w-8 h-8 text-yellow-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="text-center sm:text-left">
              <h3 className="text-lg sm:text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-pink-200 to-cyan-200">
                🎮 MULTIPLAYER MODE LAUNCHING! 🎮
              </h3>
              <p className="text-sm text-purple-200">January 22nd at 6:00 PM EST</p>
            </div>
          </div>
          
          {/* Countdown Timer */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex flex-col items-center bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2 min-w-[60px]">
              <span className="text-2xl sm:text-3xl font-bold text-yellow-300">{timeLeft.days}</span>
              <span className="text-xs text-purple-200 uppercase tracking-wide">Days</span>
            </div>
            <span className="text-2xl font-bold text-yellow-300">:</span>
            <div className="flex flex-col items-center bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2 min-w-[60px]">
              <span className="text-2xl sm:text-3xl font-bold text-yellow-300">{String(timeLeft.hours).padStart(2, '0')}</span>
              <span className="text-xs text-purple-200 uppercase tracking-wide">Hours</span>
            </div>
            <span className="text-2xl font-bold text-yellow-300">:</span>
            <div className="flex flex-col items-center bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2 min-w-[60px]">
              <span className="text-2xl sm:text-3xl font-bold text-yellow-300">{String(timeLeft.minutes).padStart(2, '0')}</span>
              <span className="text-xs text-purple-200 uppercase tracking-wide">Min</span>
            </div>
            <span className="text-2xl font-bold text-yellow-300">:</span>
            <div className="flex flex-col items-center bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2 min-w-[60px]">
              <span className="text-2xl sm:text-3xl font-bold text-pink-300 animate-pulse">{String(timeLeft.seconds).padStart(2, '0')}</span>
              <span className="text-xs text-purple-200 uppercase tracking-wide">Sec</span>
            </div>
          </div>
        </div>
        
        <p className="relative text-center text-sm text-purple-200 mt-3 font-medium">
          ⚡ Challenge your friends in real-time math battles! ⚡
        </p>
      </div>
    </div>
  );
};

interface Score {
  playerName: string;
  score: number;
}

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

const StatisticsDisplay: React.FC = () => {
    const [stats, setStats] = useState<AllQuizStats | null>(null);
    const [confirmingClear, setConfirmingClear] = useState<Operation | null>(null);

    const refreshStats = useCallback(() => {
        try {
            const storedStatsRaw = localStorage.getItem('mathWhizStats');
            if (storedStatsRaw) {
                const parsedStats = JSON.parse(storedStatsRaw);
                setStats(parsedStats);
            } else {
                setStats(null);
            }
        } catch (error) {
            console.error("Failed to load stats:", error);
            setStats(null);
        }
    }, []);

    useEffect(() => {
        refreshStats();
    }, [refreshStats]);
    
    const StatCard: React.FC<{ icon: React.ReactNode, title: string, value: string | React.ReactNode, footer: string }> = ({ icon, title, value, footer }) => (
        <div className="flex flex-col justify-between p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
            <div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    {icon}
                    <h4 className="font-semibold">{title}</h4>
                </div>
                <p className="text-3xl font-bold text-slate-800 dark:text-slate-100 my-2">{value}</p>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{footer}</p>
        </div>
    );

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
                const storedStatsRaw = localStorage.getItem('mathWhizStats');
                const currentStats: AllQuizStats = storedStatsRaw ? JSON.parse(storedStatsRaw) : {};
                
                if (!currentStats || !currentStats[operation]) return;

                const newStats = { ...currentStats };
                delete newStats[operation];

                if (Object.keys(newStats).length === 0) {
                    localStorage.removeItem('mathWhizStats');
                } else {
                    localStorage.setItem('mathWhizStats', JSON.stringify(newStats));
                }
                
                refreshStats();
                setConfirmingClear(null); // Reset confirmation state
            } else {
                setConfirmingClear(operation);
                // Reset after 3 seconds if not confirmed
                setTimeout(() => {
                    setConfirmingClear(currentOp => (currentOp === operation ? null : currentOp));
                }, 3000);
            }
        };

        return (
            <div key={operation}>
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 capitalize">{operation}</h3>
                    <button 
                        onClick={handleClearClick}
                        className={`flex items-center gap-1.5 px-3 py-1 text-sm font-semibold rounded-full transition-colors ${
                            isConfirming 
                                ? 'bg-red-600 text-white' 
                                : 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/10 hover:bg-red-200 dark:hover:bg-red-500/20'
                        }`}
                    >
                        <TrashIcon className="w-4 h-4" />
                        {isConfirming ? "Confirm Clear" : "Clear Progress"}
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
                                        <span key={num} className="flex items-center justify-center h-10 w-10 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded-full font-bold text-xl">{num}</span>
                                    ))}
                                </div>
                            ) : '-'
                        }
                        footer={topNumbers.length > 0 ? "Most practiced" : "No data yet"}
                    />
                </div>
            </div>
        );
    }
    
    if (!stats || Object.keys(stats).length === 0) {
        return null; // Don't show anything if there are no stats
    }

    return (
        <div className="mt-6 p-6 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 animate-fade-in">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4 text-center">📊 Your Progress</h2>
            <div className="space-y-6">
                 {Object.entries(stats).map(([op, data]) => renderStatSection(op as Operation, data as QuizStats))}
            </div>
        </div>
    );
};

const getOperationDisplayName = (op: Operation) => {
    switch (op) {
        case 'multiplication': return 'Multiplication';
        case 'division': return 'Division';
        case 'squares': return 'Squares';
        case 'square-roots': return 'Square Roots';
        case 'fraction-to-decimal': return 'Fraction → Decimal';
        case 'decimal-to-fraction': return 'Decimal → Fraction';
        case 'fraction-to-percent': return 'Fraction → Percent';
        case 'percent-to-fraction': return 'Percent → Fraction';
        case 'negative-numbers': return 'Negative Numbers';
        default: return '';
    }
};

const operations: Operation[] = [
    'multiplication', 'division', 'squares', 'square-roots',
    'fraction-to-decimal', 'decimal-to-fraction',
    'fraction-to-percent', 'percent-to-fraction',
    'negative-numbers'
];

const HallOfFameDisplay: React.FC = () => {
    const [scores, setScores] = useState<Score[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [availableDates, setAvailableDates] = useState<{ [year: number]: number[] }>({});
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
    const [monthlyChampions, setMonthlyChampions] = useState<Partial<Record<Operation, Score | null>>>({});

    const months = [
        { value: 1, name: 'January' }, { value: 2, name: 'February' }, { value: 3, name: 'March' },
        { value: 4, name: 'April' }, { value: 5, name: 'May' }, { value: 6, name: 'June' },
        { value: 7, name: 'July' }, { value: 8, name: 'August' }, { value: 9, name: 'September' },
        { value: 10, name: 'October' }, { value: 11, name: 'November' }, { value: 12, name: 'December' }
    ];

    useEffect(() => {
        const fetchDates = async () => {
            setIsLoading(true);
            try {
                const response = await fetch('/api/get-hall-of-fame-dates');
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
                console.error("Error fetching hall of fame dates:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchDates();
    }, []);

    useEffect(() => {
        if (!selectedYear || !selectedMonth) {
            setScores([]);
            return;
        }

        const fetchAllChampions = async () => {
            setIsLoading(true);
            const champions: Record<Operation, Score | null> = {} as Record<Operation, Score | null>;
            for (const op of operations) {
                try {
                    const response = await fetch(`/api/get-hall-of-fame?operationType=${op}&year=${selectedYear}&month=${selectedMonth}`);
                    if (response.ok) {
                        const data = await response.json();
                        champions[op] = data.length > 0 ? data[0] : null; // Get only the top score
                    } else {
                        champions[op] = null;
                    }
                } catch (error) {
                    console.error(`Error fetching hall of fame for ${op}:`, error);
                    champions[op] = null;
                }
            }
            setMonthlyChampions(champions);
            setIsLoading(false);
        };

        fetchAllChampions();
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
        )
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
                    <select
                        value={selectedYear || ''}
                        onChange={(e) => {
                            const year = parseInt(e.target.value);
                            setSelectedYear(year);
                            setSelectedMonth(availableDates[year][0]);
                        }}
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                    >
                        {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                    <select
                        value={selectedMonth || ''}
                        onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                    >
                        {availableMonthsForYear.map(monthValue => {
                           const monthName = months.find(m => m.value === monthValue)?.name;
                           return <option key={monthValue} value={monthValue}>{monthName}</option>
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
                    {operations.map(op => {
                        const champion = monthlyChampions[op];
                        return (
                            <div key={op} className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
                                <h4 className="font-bold text-blue-600 dark:text-blue-400 capitalize">{getOperationDisplayName(op)}</h4>
                                {champion ? (
                                    <>
                                        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">{champion.playerName}</p>
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

const GlobalLeaderboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Operation>('multiplication');
  const [scores, setScores] = useState<Score[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const timerId = setInterval(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        // Last day of current month, at 23:59:59
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
      if (!response.ok) {
        throw new Error('Failed to fetch scores');
      }
      const data = await response.json();
      setScores(data);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      setScores([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  const getOperationDisplayName = (op: Operation) => {
    switch (op) {
      case 'multiplication': return 'Multiplication';
      case 'division': return 'Division';
      case 'squares': return 'Squares';
      case 'square-roots': return 'Square Roots';
      case 'fraction-to-decimal': return 'Fraction → Decimal';
      case 'decimal-to-fraction': return 'Decimal → Fraction';
      case 'fraction-to-percent': return 'Fraction → Percent';
      case 'percent-to-fraction': return 'Percent → Fraction';
      case 'negative-numbers': return 'Negative Numbers';
      default: return '';
    }
  };

  return (
    <div className="mt-10 p-6 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 animate-fade-in">
      <div className="flex flex-col items-center text-center mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2">
            🏆 Global Leaderboards
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
            See how you stack up against other players this month.
          </p>
        </div>
        <div className="mt-4">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Resets In</div>
          <div className="flex gap-2 justify-center text-blue-600 dark:text-blue-400">
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
          {operations.map((op) => (
            <button
              key={op}
              onClick={() => setActiveTab(op)}
              className={`${
                activeTab === op
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm transition-colors`}
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
        subtitle="Scores for the current month (updates every minute)"
      />
    </div>
  );
};


const HighScoresDisplay: React.FC = () => {
  const [highScores, setHighScores] = useState<HighScores | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const refreshHighScores = useCallback(() => {
    try {
        const storedScoresRaw = localStorage.getItem('mathWhizHighScores');
        if (storedScoresRaw) {
            const parsedScores = JSON.parse(storedScoresRaw);
            setHighScores(parsedScores);
        } else {
            setHighScores(null);
        }
    } catch (error) {
        console.error("Failed to load high scores:", error);
        setHighScores(null);
    }
  }, []);

  useEffect(() => {
    refreshHighScores();
  }, [refreshHighScores]);

  const handleClearHighScores = () => {
    if (confirmingClear) {
        localStorage.removeItem('mathWhizHighScores');
        refreshHighScores();
        setConfirmingClear(false); // Reset confirmation state
    } else {
        setConfirmingClear(true);
        // Reset after 3 seconds if not confirmed
        setTimeout(() => setConfirmingClear(false), 3000);
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

  const sortedScores = Object.entries(highScores).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

  return (
    <div className="mt-10 p-6 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">🏆 Personal Bests</h2>
        <button 
            onClick={handleClearHighScores}
            className={`flex items-center gap-1.5 px-3 py-1 text-sm font-semibold rounded-full transition-colors ${
                confirmingClear 
                    ? 'bg-red-600 text-white' 
                    : 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/10 hover:bg-red-200 dark:hover:bg-red-500/20'
            }`}
        >
            <TrashIcon className="w-4 h-4" />
            {confirmingClear ? "Confirm Clear" : "Clear All"}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sortedScores.map(([key, score]) => {
          const operation = key;
          const highScore = score as HighScore;
          return (
            <div key={key} className="p-3 bg-white dark:bg-slate-900 rounded-lg flex justify-between items-center border border-slate-200 dark:border-slate-700">
              <div>
                <p className="font-semibold text-md text-blue-600 dark:text-blue-400 capitalize">{operation}</p>
              </div>
              <div className="text-right">
                 <p className="font-bold text-lg text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                   {highScore.score} / 10
                 </p>
                 <p className="text-sm text-slate-500 dark:text-slate-400">{highScore.time}s</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; step: number; children: React.ReactNode }> = ({ title, step, children }) => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-blue-600 dark:text-blue-400 font-bold">{step}</div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h2>
      </div>
      {children}
    </div>
);

export const SelectionScreen: React.FC<SelectionScreenProps> = ({ onStartQuiz, initialSettings, isDarkMode, toggleDarkMode }) => {
  const [operation, setOperation] = useState<Operation>(initialSettings?.operation || 'multiplication');
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>(initialSettings?.selectedNumbers || []);
  const [timeLimit, setTimeLimit] = useState<number>(initialSettings?.timeLimit ?? 0);
  const [questionCount, setQuestionCount] = useState<number>(initialSettings?.questionCount ?? DEFAULT_QUESTION_COUNT);
  const [showStats, setShowStats] = useState(false);
  
  // Multiplayer unlock state
  const [multiplayerUnlocked, setMultiplayerUnlocked] = useState<boolean>(() => {
    // Check if launch date has passed
    const now = new Date().getTime();
    const launchTime = MULTIPLAYER_LAUNCH_DATE.getTime();
    return now >= launchTime;
  });
  const [secretCodeBuffer, setSecretCodeBuffer] = useState('');

  // Secret code listener
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only listen for alphanumeric keys
      if (e.key.length === 1 && /[a-z0-9]/i.test(e.key)) {
        setSecretCodeBuffer(prev => {
          const newBuffer = (prev + e.key.toLowerCase()).slice(-SECRET_CODE.length);
          if (newBuffer === SECRET_CODE) {
            setMultiplayerUnlocked(true);
          }
          return newBuffer;
        });
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, []);

  // Check if launch date has passed (re-check every second)
  useEffect(() => {
    const checkLaunchDate = () => {
      const now = new Date().getTime();
      const launchTime = MULTIPLAYER_LAUNCH_DATE.getTime();
      if (now >= launchTime && !multiplayerUnlocked) {
        setMultiplayerUnlocked(true);
      }
    };

    checkLaunchDate();
    const timer = setInterval(checkLaunchDate, 1000);
    return () => clearInterval(timer);
  }, [multiplayerUnlocked]);

  const isConversionMode =
    operation === 'fraction-to-decimal' ||
    operation === 'decimal-to-fraction' ||
    operation === 'fraction-to-percent' ||
    operation === 'percent-to-fraction';
  const isLeaderboardOperation = operations.includes(operation);
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
            seconds: seconds > 0 ? String(seconds) : ''
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

  useEffect(() => {
    setSelectedNumbers([]);
    // Reset question count if it exceeds max for new operation
    const newMax = isConversionMode ? MAX_CONVERSION_QUESTION_COUNT : MAX_QUESTION_COUNT;
    setQuestionCount(prev => prev > newMax ? newMax : prev);
  }, [operation, isConversionMode]);

  const needsAtLeastTen = (operation === 'squares' || operation === 'square-roots') && selectedNumbers.length > 0 && selectedNumbers.length < 10;

  const toggleNumber = (num: number) => {
    setSelectedNumbers(prev =>
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  const selectAll = () => {
    if (selectedNumbers.length === numbers.length) {
      setSelectedNumbers([]);
    } else {
      setSelectedNumbers(numbers);
    }
  };

  const handleTimeSelection = (value: number) => {
    setTimeLimit(value);
    setShowCustomTimeInput(false);
    setCustomMinutes('');
    setCustomSeconds('');
  };

  const handleCustomTimeToggle = () => {
    setShowCustomTimeInput(true);
  };

  const handleCustomTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    // Only allow numeric input, max 2 digits
    const numericValue = value.replace(/[^0-9]/g, '').slice(0, 2);
    if (name === 'minutes') {
        setCustomMinutes(numericValue);
    } else if (name === 'seconds') {
        setCustomSeconds(numericValue);
    }
  };
  
  const handleStart = () => {
      if (selectedNumbers.length === 0 && !isConversionMode) return;
      
      let finalTimeLimit = timeLimit;
      if (showCustomTimeInput) {
          const mins = parseInt(customMinutes, 10) || 0;
          const secs = parseInt(customSeconds, 10) || 0;
          finalTimeLimit = (mins * 60) + secs;
      }
      onStartQuiz(operation, selectedNumbers, finalTimeLimit, questionCount);
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 relative">
      <button onClick={toggleDarkMode} className="absolute top-4 right-4 p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
        {isDarkMode ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
      </button>

        <h1 className="text-4xl sm:text-5xl font-extrabold text-center text-slate-800 dark:text-white mb-2">Math Practice</h1>
        <p className="text-center text-slate-500 dark:text-slate-400 mb-6">Sharpen your skills. Select your challenge below.</p>
        
        {/* Countdown Banner - only show if multiplayer not unlocked */}
        {!multiplayerUnlocked && <CountdownBanner />}
        
        {/* Multiplayer Button - only show if unlocked */}
        {multiplayerUnlocked && (
          <div className="flex justify-center mb-10">
            <Link
              to="/multiplayer"
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-lg rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 flex items-center gap-2"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Multiplayer Mode
            </Link>
          </div>
        )}

        <div className="space-y-8">
            <Section title="Pick Your Operation" step={1}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <button onClick={() => setOperation('multiplication')} className={`px-6 py-3 text-lg font-semibold rounded-lg transition-all duration-200 border-2 ${operation === 'multiplication' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'}`}>
                        Multiplication (×)
                    </button>
                    <button onClick={() => setOperation('division')} className={`px-6 py-3 text-lg font-semibold rounded-lg transition-all duration-200 border-2 ${operation === 'division' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'}`}>
                        Division (÷)
                    </button>
                    <button onClick={() => setOperation('squares')} className={`px-6 py-3 text-lg font-semibold rounded-lg transition-all duration-200 border-2 ${operation === 'squares' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'}`}>
                        Squares (x<sup>2</sup>)
                    </button>
                    <button onClick={() => setOperation('square-roots')} className={`px-6 py-3 text-lg font-semibold rounded-lg transition-all duration-200 border-2 ${operation === 'square-roots' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'}`}>
                        Square Roots (√)
                    </button>
                    <button onClick={() => setOperation('fraction-to-decimal')} className={`px-6 py-3 text-lg font-semibold rounded-lg transition-all duration-200 border-2 ${operation === 'fraction-to-decimal' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'}`}>
                        Fraction → Decimal
                    </button>
                    <button onClick={() => setOperation('decimal-to-fraction')} className={`px-6 py-3 text-lg font-semibold rounded-lg transition-all duration-200 border-2 ${operation === 'decimal-to-fraction' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'}`}>
                        Decimal → Fraction
                    </button>
                    <button onClick={() => setOperation('fraction-to-percent')} className={`px-6 py-3 text-lg font-semibold rounded-lg transition-all duration-200 border-2 ${operation === 'fraction-to-percent' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'}`}>
                        Fraction → Percent
                    </button>
                    <button onClick={() => setOperation('percent-to-fraction')} className={`px-6 py-3 text-lg font-semibold rounded-lg transition-all duration-200 border-2 ${operation === 'percent-to-fraction' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'}`}>
                        Percent → Fraction
                    </button>
                    <button onClick={() => setOperation('negative-numbers')} className={`px-6 py-3 text-lg font-semibold rounded-lg transition-all duration-200 border-2 ${operation === 'negative-numbers' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'}`}>
                        Negative Numbers (±)
                    </button>
                </div>
            </Section>

            {!isConversionMode && (
                <Section title="Select Numbers" step={2}>
                    <div className={`grid ${operation === 'squares' || operation === 'square-roots' ? 'grid-cols-5 sm:grid-cols-10' : 'grid-cols-4 sm:grid-cols-6'} gap-3 text-center`}>
                        {numbers.map(num => (
                            <button key={num} onClick={() => toggleNumber(num)} className={`p-3 text-lg font-bold rounded-lg transition-transform duration-200 transform ease-bouncy border-2 ${selectedNumbers.includes(num) ? 'bg-blue-600 text-white border-blue-600 scale-105' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'}`}>
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
                        <button onClick={selectAll} className="px-6 py-2 font-semibold text-white bg-slate-600 dark:bg-slate-700 rounded-full hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors shadow-sm">
                            {selectedNumbers.length === numbers.length ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>
                </Section>
            )}

            <Section title="Set a Time Limit" step={isConversionMode ? 2 : 3}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {timeOptions.map(option => (
                        <button key={option.value} onClick={() => handleTimeSelection(option.value)} className={`px-4 py-2 font-semibold rounded-lg transition-all duration-200 border-2 ${timeLimit === option.value && !showCustomTimeInput ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'}`}>
                            {option.label}
                        </button>
                    ))}
                    <button onClick={handleCustomTimeToggle} className={`px-4 py-2 font-semibold rounded-lg transition-all duration-200 border-2 ${showCustomTimeInput ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'}`}>
                        Custom
                    </button>
                </div>
                <div className={`transition-all duration-300 ease-in-out overflow-hidden ${showCustomTimeInput ? 'max-h-24 opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'}`}>
                    <div className="flex justify-center items-center gap-2">
                        <input
                            type="text"
                            name="minutes"
                            value={customMinutes}
                            onChange={handleCustomTimeChange}
                            placeholder="MM"
                            className="w-20 p-2 text-center text-xl font-bold border-2 border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                            maxLength={2}
                            inputMode="numeric"
                        />
                        <span className="text-2xl font-bold text-slate-500">:</span>
                        <input
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
                            className="w-12 h-12 text-2xl font-bold rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            −
                        </button>
                        <div className="flex flex-col items-center">
                            <input
                                type="range"
                                min={MIN_QUESTION_COUNT}
                                max={maxQuestions}
                                step={1}
                                value={questionCount}
                                onChange={(e) => setQuestionCount(parseInt(e.target.value, 10))}
                                className="w-48 sm:w-64 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                            <span className="text-3xl font-bold text-slate-800 dark:text-slate-100 mt-2">{questionCount}</span>
                        </div>
                        <button 
                            onClick={() => setQuestionCount(prev => Math.min(maxQuestions, prev + 5))}
                            disabled={questionCount >= maxQuestions}
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
             <button onClick={() => setShowStats(prev => !prev)} className="px-6 py-2 font-semibold text-white bg-slate-600 dark:bg-slate-700 rounded-full hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors shadow-sm flex items-center gap-2">
                 <ChartBarIcon className="w-5 h-5"/>
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
