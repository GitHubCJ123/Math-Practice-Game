import { useEffect, useState } from 'react';
import { INTRO_COUNTDOWN_STAGE_MS } from '@shared/types';

export type IntroStage = 'ready' | 'set' | 'go' | 'finished';

/**
 * Runs the classic "Ready... Set... Go..." countdown state machine used
 * before a quiz begins. Each stage advances after `stageMs` (default 1000ms).
 */
export function useIntroCountdown(stageMs: number = INTRO_COUNTDOWN_STAGE_MS): IntroStage {
  const [stage, setStage] = useState<IntroStage>('ready');

  useEffect(() => {
    if (stage === 'finished') return;
    const id = window.setTimeout(() => {
      setStage(prev =>
        prev === 'ready' ? 'set' : prev === 'set' ? 'go' : 'finished'
      );
    }, stageMs);
    return () => window.clearTimeout(id);
  }, [stage, stageMs]);

  return stage;
}
