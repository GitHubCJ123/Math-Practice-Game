import React from 'react';

export const MathDashAd: React.FC = () => {
  return (
    <div className="w-full max-w-[400px]">
      <a
        href="https://math-dash.vercel.app"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Play Math Dash (opens in a new tab)"
        className="mathdash-frame group sticky top-4 block transition-transform duration-200 hover:-translate-y-1"
      >
        <div className="relative overflow-hidden rounded-[22px] bg-slate-900 p-6 text-center">
          {/* Twinkling starfield + top glow */}
          <div className="mathdash-stars pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-fuchsia-500/30 blur-3xl" />

          {/* Featured chip */}
          <span className="relative z-10 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-pink-200 ring-1 ring-white/15 backdrop-blur">
            ★ Featured Game
          </span>

          <div className="relative z-10 mt-4 flex flex-col items-center">
            <span className="mathdash-rocket text-6xl drop-shadow-[0_8px_16px_rgba(236,72,153,0.45)]">🚀</span>

            <h3 className="mathdash-title mt-3 font-display text-4xl font-bold tracking-tight">
              MATH DASH
            </h3>

            <p className="mt-3 text-sm font-medium text-slate-300">
              Race through neon obstacles while solving rapid-fire math problems!
            </p>

            <span className="mathdash-cta relative mt-5 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-pink-500 to-violet-600 px-5 py-3.5 font-display text-lg font-bold text-white shadow-[0_10px_30px_-8px_rgba(217,70,239,0.7)] transition-transform duration-200 group-hover:scale-[1.03]">
              PLAY NOW
              <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </span>

            <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-400">
              <span className="rounded-full bg-white/5 px-2.5 py-1 ring-1 ring-white/10">⚡ Speed</span>
              <span className="rounded-full bg-white/5 px-2.5 py-1 ring-1 ring-white/10">🧮 Math</span>
              <span className="rounded-full bg-white/5 px-2.5 py-1 ring-1 ring-white/10">🎮 Fun</span>
            </div>
          </div>
        </div>
      </a>
    </div>
  );
};

