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
  return (
    <div className="w-full p-4 bg-white border border-gray-200 rounded-lg shadow-md dark:bg-gray-800 dark:border-gray-700">
      <h3 className="text-xl font-bold text-center mb-2 text-gray-900 dark:text-white">{title}</h3>
      {subtitle && <p className="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">{subtitle}</p>}
      {isLoading ? (
        <div className="text-center text-gray-500 dark:text-gray-400">Loading scores...</div>
      ) : scores.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400">No scores yet. Be the first!</div>
      ) : (
        <ol className="divide-y divide-gray-200 dark:divide-gray-700">
          {scores.map((score, index) => (
            <li key={index} className="py-2 flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-lg font-bold text-gray-500 dark:text-gray-400 w-8">{index + 1}.</span>
                <span className="text-md font-medium text-gray-800 dark:text-gray-200">{score.playerName}</span>
              </div>
              <span className="text-md font-bold text-blue-600 dark:text-blue-400">{formatScore(score.score)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
