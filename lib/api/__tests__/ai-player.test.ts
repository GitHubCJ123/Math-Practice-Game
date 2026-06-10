import { describe, it, expect } from 'vitest';
import { AI_PROFILES, createAIPlayer } from '../ai-player.js';
import type { AIDifficulty } from '../../../shared/types.js';

const DIFFICULTIES: AIDifficulty[] = ['easy', 'medium', 'hard', 'expert'];

describe('AI_PROFILES', () => {
  it('defines a profile for every difficulty', () => {
    for (const d of DIFFICULTIES) {
      expect(AI_PROFILES[d]).toBeDefined();
      expect(AI_PROFILES[d].name).toBeTruthy();
    }
  });

  it('keeps accuracy within [0, 1] and minTime <= maxTime', () => {
    for (const d of DIFFICULTIES) {
      const p = AI_PROFILES[d];
      expect(p.accuracy).toBeGreaterThanOrEqual(0);
      expect(p.accuracy).toBeLessThanOrEqual(1);
      expect(p.minTimePerQuestion).toBeLessThanOrEqual(p.maxTimePerQuestion);
    }
  });

  it('gets more accurate and faster as difficulty increases', () => {
    expect(AI_PROFILES.easy.accuracy).toBeLessThan(AI_PROFILES.expert.accuracy);
    // The hardest bot's slowest answer is still faster than the easiest bot's fastest.
    expect(AI_PROFILES.expert.maxTimePerQuestion).toBeLessThan(AI_PROFILES.easy.minTimePerQuestion);
  });
});

describe('createAIPlayer', () => {
  it('creates a ready AI player tagged with its difficulty', () => {
    for (const d of DIFFICULTIES) {
      const player = createAIPlayer(d);
      expect(player.isAI).toBe(true);
      expect(player.isReady).toBe(true);
      expect(player.connected).toBe(true);
      expect(player.isHost).toBe(false);
      expect(player.aiDifficulty).toBe(d);
      expect(player.name).toBe(AI_PROFILES[d].name);
      expect(player.id.startsWith(`ai_${d}_`)).toBe(true);
    }
  });

  it('gives each AI player a distinct id', () => {
    const ids = DIFFICULTIES.map(d => createAIPlayer(d).id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
