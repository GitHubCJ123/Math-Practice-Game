import React from 'react';

interface Score {
  playerName: string;
  score: number;
}

interface LeaderboardProps {
  title: string;
  scores: Score[];
  isLoading: boolean;
  subtitle?: string;
}

// A simple utility to format the score (milliseconds) into seconds
const formatScore = (score: number) => {
  return `${(score / 1000).toFixed(3)}s`;
};

export const Leaderboard: React.FC<LeaderboardProps> = ({
  title,
  scores,
  isLoading,
  subtitle,
}) => {
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="w-full p-4 rounded-2xl bg-white border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-700">
      <h3 className="font-display text-xl font-bold text-center mb-2 text-slate-900 dark:text-white">{title}</h3>
      {subtitle && <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-4">{subtitle}</p>}
      {isLoading ? (
        <div className="text-center text-slate-500 dark:text-slate-400 py-4">Loading scores...</div>
      ) : scores.length === 0 ? (
        <div className="text-center text-slate-500 dark:text-slate-400 py-4">No scores yet. Be the first! ✨</div>
      ) : (
        <ol className="space-y-1.5">
          {scores.map((score, index) => (
            <li
              key={index}
              className={`flex items-center justify-between py-2 px-3 rounded-xl transition-colors ${
                index < 3
                  ? 'bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-900/20 dark:to-fuchsia-900/10'
                  : 'odd:bg-slate-50 dark:odd:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-7 text-center text-lg">
                  {index < 3 ? medals[index] : <span className="font-display font-bold text-slate-400">{index + 1}</span>}
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{score.playerName}</span>
              </div>
              <span className="font-display font-bold text-violet-600 dark:text-violet-400 tabular-nums">{formatScore(score.score)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
