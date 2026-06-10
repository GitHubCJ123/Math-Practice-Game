/**
 * Plays a short C5 beep to signal that time is up. Used by both the solo and
 * multiplayer quiz screens. Safe to call from any browser; errors are swallowed
 * and logged so audio policy issues never break the quiz flow.
 */
export const playTimeUpSound = (): void => {
  try {
    const AudioContextCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const audioContext = new AudioContextCtor();

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.error('Could not play sound:', error);
  }
};

/**
 * Shared, lazily-created AudioContext for the lightweight UI sound effects
 * below. Reusing one context avoids exhausting the browser's context budget.
 */
let sharedContext: AudioContext | null = null;
const getContext = (): AudioContext | null => {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!sharedContext) sharedContext = new AudioContextCtor();
    if (sharedContext.state === 'suspended') void sharedContext.resume();
    return sharedContext;
  } catch {
    return null;
  }
};

interface ToneOptions {
  freq: number;
  start?: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  freqEnd?: number;
}

const playTone = (ctx: AudioContext, { freq, start = 0, duration = 0.15, type = 'sine', gain = 0.18, freqEnd }: ToneOptions): void => {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
};

/** Bright two-note "ding" for a correct answer. */
export const playCorrectSound = (): void => {
  try {
    const ctx = getContext();
    if (!ctx) return;
    playTone(ctx, { freq: 659.25, duration: 0.12, type: 'triangle', gain: 0.16 }); // E5
    playTone(ctx, { freq: 987.77, start: 0.09, duration: 0.18, type: 'triangle', gain: 0.16 }); // B5
  } catch (error) {
    console.error('Could not play sound:', error);
  }
};

/** Soft descending "buzz" for a wrong answer (never harsh). */
export const playWrongSound = (): void => {
  try {
    const ctx = getContext();
    if (!ctx) return;
    playTone(ctx, { freq: 220, freqEnd: 130, duration: 0.26, type: 'sawtooth', gain: 0.1 });
  } catch (error) {
    console.error('Could not play sound:', error);
  }
};

/** Short rising arpeggio fanfare for a win / perfect score / high score. */
export const playWinSound = (): void => {
  try {
    const ctx = getContext();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      playTone(ctx, { freq, start: i * 0.11, duration: 0.32, type: 'triangle', gain: 0.16 });
    });
    playTone(ctx, { freq: 1318.51, start: 0.5, duration: 0.4, type: 'sine', gain: 0.12 }); // E6 sparkle
  } catch (error) {
    console.error('Could not play sound:', error);
  }
};

/** Tiny tactile click for button / selection feedback. */
export const playClickSound = (): void => {
  try {
    const ctx = getContext();
    if (!ctx) return;
    playTone(ctx, { freq: 440, freqEnd: 660, duration: 0.07, type: 'square', gain: 0.07 });
  } catch (error) {
    console.error('Could not play sound:', error);
  }
};

