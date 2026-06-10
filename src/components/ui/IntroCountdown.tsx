import React from 'react';
import { createPortal } from 'react-dom';

export type IntroStage = 'ready' | 'set' | 'go' | 'finished';

interface IntroCountdownProps {
  stage: IntroStage;
}

const STAGE_CONFIG: Record<
  Exclude<IntroStage, 'finished'>,
  { label: string; face: string; edge: string; glow: string }
> = {
  ready: {
    label: 'Ready',
    face: 'linear-gradient(160deg, #a78bfa, #7c3aed)',
    edge: '#5b21b6',
    glow: 'rgba(124, 58, 237, 0.55)',
  },
  set: {
    label: 'Set',
    face: 'linear-gradient(160deg, #fbbf24, #f97316)',
    edge: '#b45309',
    glow: 'rgba(249, 115, 22, 0.55)',
  },
  go: {
    label: 'Go!',
    face: 'linear-gradient(160deg, #34d399, #059669)',
    edge: '#047857',
    glow: 'rgba(16, 185, 129, 0.6)',
  },
};

/**
 * Energetic "Ready… Set… Go!" pre-game overlay. Each stage re-mounts (via the
 * `key`) so the badge pops with a spring while two rings burst outward and a
 * stage-coloured glow fills the screen. Rendered through a portal to `body` so
 * it always centres on the viewport, unaffected by any transformed ancestor.
 */
export const IntroCountdown: React.FC<IntroCountdownProps> = ({ stage }) => {
  if (stage === 'finished' || typeof document === 'undefined') return null;
  const cfg = STAGE_CONFIG[stage];

  return createPortal(
    <div
      key={stage}
      className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {/* Stage-coloured glow wash */}
      <div
        className="intro-glow absolute left-1/2 top-1/2 h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2"
        style={{ background: `radial-gradient(closest-side, ${cfg.glow}, transparent 70%)` }}
      />

      {/* Expanding burst rings */}
      <span className="intro-ring" style={{ borderColor: cfg.edge }} />
      <span className="intro-ring intro-ring--late" style={{ borderColor: cfg.edge }} />

      {/* The pill badge that pops in */}
      <div className="intro-pop relative">
        <div
          className="relative grid place-items-center overflow-hidden rounded-full px-10 sm:px-14 py-6 sm:py-8"
          style={{
            background: cfg.face,
            boxShadow: `0 12px 0 0 ${cfg.edge}, 0 16px 24px -16px ${cfg.edge}`,
          }}
        >
          {/* glossy top highlight */}
          <span
            className="absolute inset-x-2 top-2 h-1/3 rounded-full"
            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.4), transparent)' }}
          />
          <span className="relative font-display text-6xl sm:text-8xl font-bold text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.18)]">
            {cfg.label}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};

