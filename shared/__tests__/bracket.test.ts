import { describe, it, expect } from 'vitest';
import {
  nextPowerOfTwo,
  roundCount,
  seedOrder,
  buildRound1,
  buildNextRound,
  byeWinner,
  isPlayable,
  planBracket,
  buildRoundOfBase,
  buildSeedRound,
} from '../bracket.js';

describe('nextPowerOfTwo', () => {
  it('rounds up to the next power of two (min 2)', () => {
    expect(nextPowerOfTwo(1)).toBe(2);
    expect(nextPowerOfTwo(2)).toBe(2);
    expect(nextPowerOfTwo(3)).toBe(4);
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(nextPowerOfTwo(8)).toBe(8);
    expect(nextPowerOfTwo(10)).toBe(16);
    expect(nextPowerOfTwo(30)).toBe(32);
  });
});

describe('roundCount', () => {
  it('counts rounds for a power-of-two bracket', () => {
    expect(roundCount(2)).toBe(1);
    expect(roundCount(4)).toBe(2);
    expect(roundCount(8)).toBe(3);
    expect(roundCount(16)).toBe(4);
    expect(roundCount(32)).toBe(5);
  });
});

describe('seedOrder', () => {
  it('produces the standard 4-bracket order', () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
  });

  it('produces the standard 8-bracket order', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('keeps the top two seeds in opposite halves', () => {
    const order = seedOrder(16);
    expect(order).toHaveLength(16);
    const firstHalf = order.slice(0, 8);
    const secondHalf = order.slice(8);
    expect(firstHalf).toContain(1);
    expect(secondHalf).toContain(2);
  });
});

describe('buildRound1', () => {
  it('pairs a full power-of-two field by seed', () => {
    const matches = buildRound1(['a', 'b', 'c', 'd'], 'seeded');
    expect(matches).toHaveLength(2);
    // seed order [1,4,2,3] -> (a vs d), (b vs c)
    expect(matches[0]).toEqual({ round: 1, slot: 0, p1Id: 'a', p2Id: 'd' });
    expect(matches[1]).toEqual({ round: 1, slot: 1, p1Id: 'b', p2Id: 'c' });
  });

  it('gives byes to the top seeds for a non-power-of-two field', () => {
    // 3 players -> size 4, seed order [1,4,2,3]; seed 4 absent -> bye for seed 1
    const matches = buildRound1(['a', 'b', 'c'], 'seeded');
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({ round: 1, slot: 0, p1Id: 'a', p2Id: null });
    expect(matches[1]).toEqual({ round: 1, slot: 1, p1Id: 'b', p2Id: 'c' });
    expect(byeWinner(matches[0])).toBe('a');
    expect(isPlayable(matches[0])).toBe(false);
    expect(isPlayable(matches[1])).toBe(true);
  });

  it('pairs in list order when mode is order', () => {
    const matches = buildRound1(['a', 'b', 'c', 'd'], 'order');
    expect(matches[0]).toEqual({ round: 1, slot: 0, p1Id: 'a', p2Id: 'b' });
    expect(matches[1]).toEqual({ round: 1, slot: 1, p1Id: 'c', p2Id: 'd' });
  });

  it('creates a 16-slot bracket for 10 players with 6 byes', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i + 1}`);
    const matches = buildRound1(ids, 'seeded');
    expect(matches).toHaveLength(8);
    const byes = matches.filter(m => byeWinner(m) !== null);
    const playable = matches.filter(isPlayable);
    expect(byes).toHaveLength(6);
    expect(playable).toHaveLength(2);
  });

  it('never leaves a fully-empty match for any field size (seeded)', () => {
    // Byes must always pair with a real player; a null-vs-null match would be
    // unplayable and would stall the round. Holds for every non-power-of-two N.
    for (let n = 2; n <= 32; n++) {
      const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
      const empty = buildRound1(ids, 'seeded').filter(m => !m.p1Id && !m.p2Id);
      expect(empty).toHaveLength(0);
    }
  });
});

describe('buildNextRound', () => {
  it('pairs winners by slot into the next round', () => {
    const next = buildNextRound(1, ['a', 'b', 'c', 'd']);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual({ round: 2, slot: 0, p1Id: 'a', p2Id: 'b' });
    expect(next[1]).toEqual({ round: 2, slot: 1, p1Id: 'c', p2Id: 'd' });
  });

  it('leaves seats open for unresolved feeder matches', () => {
    const next = buildNextRound(2, ['a', null]);
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({ round: 3, slot: 0, p1Id: 'a', p2Id: null });
  });

  it('produces a single final from four semifinal winners', () => {
    const semi = buildNextRound(2, ['w1', 'w2']);
    expect(semi).toHaveLength(1);
    expect(semi[0].round).toBe(3);
  });
});

describe('planBracket', () => {
  it('uses a full bracket when the field is a power of two', () => {
    expect(planBracket(2)).toEqual({ base: 2, playInCount: 0, directEntrants: 2, rounds: 1 });
    expect(planBracket(8)).toEqual({ base: 8, playInCount: 0, directEntrants: 8, rounds: 3 });
    expect(planBracket(32)).toEqual({ base: 32, playInCount: 0, directEntrants: 32, rounds: 5 });
  });

  it('adds a play-in round that trims a non-power-of-two field to `base`', () => {
    expect(planBracket(3)).toEqual({ base: 2, playInCount: 1, directEntrants: 1, rounds: 2 });
    expect(planBracket(5)).toEqual({ base: 4, playInCount: 1, directEntrants: 3, rounds: 3 });
    expect(planBracket(10)).toEqual({ base: 8, playInCount: 2, directEntrants: 6, rounds: 4 });
    expect(planBracket(30)).toEqual({ base: 16, playInCount: 14, directEntrants: 2, rounds: 5 });
  });
});

describe('adaptive seeding (buildSeedRound / buildPlayIn / buildRoundOfBase)', () => {
  it('seeds 10 players as a 2-game play-in feeding a full round of 8', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i + 1}`);
    const round1 = buildSeedRound(ids);
    expect(round1).toHaveLength(2);
    // lowest seeds pair off: 7v10 and 8v9 — both real games, no byes.
    expect(round1[0]).toEqual({ round: 1, slot: 0, p1Id: 'p7', p2Id: 'p10' });
    expect(round1[1]).toEqual({ round: 1, slot: 1, p1Id: 'p8', p2Id: 'p9' });

    const base = buildRoundOfBase(2, ids, ['p7', 'p8']); // pretend top seeds won
    expect(base).toHaveLength(4);
    const seats = base.flatMap(m => [m.p1Id, m.p2Id]);
    ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].forEach(id => expect(seats).toContain(id));
    expect(seats).not.toContain(null);
  });

  it('produces only real two-player matches for every field size 2..32', () => {
    for (let n = 2; n <= 32; n++) {
      const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
      const plan = planBracket(n);
      const round1 = buildSeedRound(ids);
      round1.forEach(m => {
        expect(m.p1Id).not.toBeNull();
        expect(m.p2Id).not.toBeNull();
      });
      if (plan.playInCount > 0) {
        expect(round1).toHaveLength(plan.playInCount);
        const winners = round1.map((_, i) => `w${i}`);
        const base = buildRoundOfBase(2, ids, winners);
        expect(base).toHaveLength(plan.base / 2);
        base.forEach(m => {
          expect(m.p1Id).not.toBeNull();
          expect(m.p2Id).not.toBeNull();
        });
      } else {
        expect(round1).toHaveLength(n / 2);
      }
    }
  });
});
