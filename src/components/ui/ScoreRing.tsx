import React from 'react';

interface ScoreRingProps {
  correct: number;
  total: number;
  /** Diameter in px. */
  size?: number;
}

/**
 * Animated circular score ring for the results screen. The arc colour shifts
 * from rose → amber → emerald based on the percentage correct, and the arc
 * fills in with a spring on mount via the `.score-ring__value` keyframes.
 */
export const ScoreRing: React.FC<ScoreRingProps> = ({ correct, total, size = 168 }) => {
  const pct = total > 0 ? correct / total : 0;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct);

  const color = pct === 1 ? '#22c55e' : pct >= 0.8 ? '#10b981' : pct >= 0.5 ? '#f59e0b' : '#fb7185';

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-200 dark:stroke-slate-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          className="score-ring__value"
          style={
            {
              '--ring-start': `${circumference}`,
              '--ring-end': `${offset}`,
              strokeDashoffset: offset,
              filter: `drop-shadow(0 0 8px ${color}66)`,
            } as React.CSSProperties
          }
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div className="animate-count-pop">
          <div className="font-display text-4xl font-bold leading-none text-slate-800 dark:text-white">
            {correct}
            <span className="text-2xl text-slate-400 dark:text-slate-500">/{total}</span>
          </div>
          <div className="mt-1 text-sm font-bold" style={{ color }}>
            {Math.round(pct * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
};
