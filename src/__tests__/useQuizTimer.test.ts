// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuizTimer } from '../hooks/useQuizTimer';

/**
 * Exercises the REAL hook (the existing timer-fairness test only checks the
 * extracted arithmetic). Fake timers drive setInterval, and performance.now is
 * pinned to the fake clock so elapsed time tracks wall-clock advancement
 * deterministically — the whole point of the wall-clock design.
 */
describe('useQuizTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts at zero and not running', () => {
    const { result } = renderHook(() => useQuizTimer());
    expect(result.current.elapsedMs).toBe(0);
    expect(result.current.isRunning).toBe(false);
  });

  it('advances elapsed time by the wall clock after start()', () => {
    const { result } = renderHook(() => useQuizTimer({ tickMs: 10 }));

    act(() => {
      result.current.start();
    });
    expect(result.current.isRunning).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // ~1000ms of real time elapsed (allow a tick of slack).
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(990);
    expect(result.current.elapsedMs).toBeLessThanOrEqual(1010);
  });

  it('freezes elapsed time when stopped', () => {
    const { result } = renderHook(() => useQuizTimer({ tickMs: 10 }));

    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      result.current.stop();
    });

    const frozen = result.current.elapsedMs;
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.elapsedMs).toBe(frozen);
    expect(result.current.isRunning).toBe(false);
  });

  it('resets elapsed time to zero and stops running', () => {
    const { result } = renderHook(() => useQuizTimer({ tickMs: 10 }));

    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    act(() => {
      result.current.reset();
    });

    expect(result.current.elapsedMs).toBe(0);
    expect(result.current.isRunning).toBe(false);
  });

  it('invokes onTick with the latest elapsed time', () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useQuizTimer({ tickMs: 10, onTick }));

    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(onTick).toHaveBeenCalled();
    const lastElapsed = onTick.mock.calls.at(-1)![0];
    expect(lastElapsed).toBeGreaterThan(0);
  });
});
