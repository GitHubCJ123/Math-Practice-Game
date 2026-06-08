import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * High-precision wall-clock timer used by quiz screens.
 *
 * Returns elapsedMs along with `start`, `stop`, and `reset` controls.
 * The tick callback is optional and receives the latest elapsed time
 * (in milliseconds) on each animation interval; it's handy for triggering
 * time-up logic.
 */
export function useQuizTimer(options?: {
  tickMs?: number;
  onTick?: (elapsedMs: number) => void;
}): {
  elapsedMs: number;
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
} {
  const { tickMs = 10, onTick } = options ?? {};
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const startRef = useRef<number | null>(null);
  const onTickRef = useRef(onTick);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    if (!isRunning) return;
    if (startRef.current === null) {
      startRef.current = performance.now();
    }
    const startedAt = startRef.current;
    const id = window.setInterval(() => {
      const next = performance.now() - startedAt;
      setElapsedMs(next);
      onTickRef.current?.(next);
    }, tickMs);
    return () => window.clearInterval(id);
  }, [isRunning, tickMs]);

  const start = useCallback(() => setIsRunning(true), []);
  const stop = useCallback(() => setIsRunning(false), []);
  const reset = useCallback(() => {
    setIsRunning(false);
    startRef.current = null;
    setElapsedMs(0);
  }, []);

  return { elapsedMs, isRunning, start, stop, reset };
}
