import React, { useMemo } from 'react';

interface ConfettiProps {
  /** Number of confetti pieces to render. */
  count?: number;
  /** Total duration the burst is visible, in ms (used by callers to unmount). */
  className?: string;
}

const COLORS = [
  '#8b5cf6',
  '#d946ef',
  '#0ea5e9',
  '#22d3ee',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#f97316',
];

/**
 * Lightweight, dependency-free confetti burst. Renders a fixed full-screen
 * layer of CSS-animated pieces. Purely decorative (aria-hidden); callers
 * control how long it stays mounted.
 */
export const Confetti: React.FC<ConfettiProps> = ({ count = 90, className = '' }) => {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const left = Math.random() * 100;
        const drift = (Math.random() - 0.5) * 40; // vw drift
        const duration = 2.6 + Math.random() * 2.2;
        const delay = Math.random() * 0.6;
        const size = 7 + Math.random() * 9;
        const rotate = 540 + Math.random() * 720;
        const color = COLORS[i % COLORS.length];
        const round = Math.random() > 0.6;
        return { left, drift, duration, delay, size, rotate, color, round, id: i };
      }),
    [count]
  );

  return (
    <div className={`confetti-layer ${className}`} aria-hidden="true">
      {pieces.map(p => (
        <span
          key={p.id}
          className="confetti-piece"
          style={
            {
              left: `${p.left}vw`,
              width: `${p.size}px`,
              height: `${p.size * (p.round ? 1 : 1.4)}px`,
              background: p.color,
              borderRadius: p.round ? '50%' : '2px',
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              '--cx': `${p.drift}vw`,
              '--cr': `${p.rotate}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
};
