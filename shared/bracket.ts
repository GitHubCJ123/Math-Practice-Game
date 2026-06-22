/**
 * Pure single-elimination bracket helpers — no DB, no IO. Keeping the bracket
 * structure math here (rather than in plpgsql) makes it unit-testable and lets
 * the tournament endpoint compute pairings, then hand concrete rows to the thin
 * `tt_*` persistence functions. Seeding/advancement are organizer-only, serial
 * operations, so computing in JS and persisting in SQL is safe (the hot,
 * concurrent paths — join/submit — stay atomic in Postgres).
 */

/** A single bracket match slot. `null` participant = empty seat / bye. */
export interface BracketMatch {
  round: number;
  slot: number; // 0-based position within the round
  p1Id: string | null;
  p2Id: string | null;
}

/** Smallest power of two >= n (minimum 2). */
export function nextPowerOfTwo(n: number): number {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

/** Number of rounds in a bracket of `size` slots (size must be a power of two). */
export function roundCount(size: number): number {
  return Math.max(1, Math.round(Math.log2(size)));
}

/**
 * Standard single-elimination seed positions for a bracket of `size` slots.
 * Returns an array of length `size` where entry `i` is the 1-based seed that
 * belongs at position `i`, arranged so top seeds are spread across the bracket
 * (seed 1 and seed 2 can only meet in the final).
 */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    const next: number[] = [];
    for (const seed of order) {
      next.push(seed);
      next.push(sum - seed);
    }
    order = next;
  }
  return order;
}

/**
 * Build round-1 matches from an ordered participant list.
 * - `seeded`: place participants by seed using the standard bracket order, so
 *   byes (when participants < bracket size) fall to the top seeds.
 * - `order`: pair participants in list order (1v2, 3v4, …) — used for fully
 *   manual brackets where the organizer has already arranged the list.
 */
export function buildRound1(
  participantIds: string[],
  mode: 'seeded' | 'order' = 'seeded'
): BracketMatch[] {
  const n = participantIds.length;
  const size = nextPowerOfTwo(Math.max(n, 2));
  const slots: (string | null)[] = new Array(size).fill(null);

  if (mode === 'order') {
    for (let i = 0; i < n; i++) slots[i] = participantIds[i];
  } else {
    const order = seedOrder(size);
    for (let pos = 0; pos < size; pos++) {
      const seed = order[pos];
      slots[pos] = seed <= n ? participantIds[seed - 1] : null;
    }
  }

  const matches: BracketMatch[] = [];
  for (let i = 0; i < size; i += 2) {
    matches.push({ round: 1, slot: i / 2, p1Id: slots[i], p2Id: slots[i + 1] });
  }
  return matches;
}

/**
 * Build the skeleton matches for `round + 1` from the winners of `round`,
 * ordered by slot. A `null` winner leaves that seat open until the feeding
 * match resolves.
 */
export function buildNextRound(round: number, winnersBySlot: (string | null)[]): BracketMatch[] {
  const matches: BracketMatch[] = [];
  for (let i = 0; i < winnersBySlot.length; i += 2) {
    matches.push({
      round: round + 1,
      slot: i / 2,
      p1Id: winnersBySlot[i] ?? null,
      p2Id: winnersBySlot[i + 1] ?? null,
    });
  }
  return matches;
}

/**
 * If a match has exactly one participant (the other side is a bye), return that
 * participant — they advance automatically without playing. Returns `null` for
 * real two-participant matches and fully empty seats.
 */
export function byeWinner(match: Pick<BracketMatch, 'p1Id' | 'p2Id'>): string | null {
  if (match.p1Id && !match.p2Id) return match.p1Id;
  if (!match.p1Id && match.p2Id) return match.p2Id;
  return null;
}

/** True when a match needs to actually be played (both seats filled). */
export function isPlayable(match: Pick<BracketMatch, 'p1Id' | 'p2Id'>): boolean {
  return Boolean(match.p1Id && match.p2Id);
}

/**
 * Adaptive bracket plan (NCAA "First Four" style). For a field that isn't a
 * power of two we DON'T pad up to the next power with byes (that strands half
 * the field on instant-win byes). Instead the lowest seeds play a small
 * "play-in" round that trims the field down to `base` (the largest power of two
 * that fits), after which the main bracket is full — every match is a real game.
 */
export interface BracketPlan {
  /** Power-of-two size of the main bracket (largest power of two ≤ n). */
  base: number;
  /** Number of play-in games (0 when n is already a power of two). */
  playInCount: number;
  /** Top seeds that skip the play-in and enter the main bracket directly (2·base − n). */
  directEntrants: number;
  /** Total rounds, including the play-in round when present. */
  rounds: number;
}

export function planBracket(entrantCount: number): BracketPlan {
  const n = Math.max(2, entrantCount);
  const up = nextPowerOfTwo(n);
  const base = up === n ? n : up / 2; // largest power of two ≤ n
  const playInCount = n - base;
  const directEntrants = base - playInCount; // = 2·base − n
  const rounds = roundCount(base) + (playInCount > 0 ? 1 : 0);
  return { base, playInCount, directEntrants, rounds };
}

/**
 * Round-1 "play-in" matches: the lowest `2·playInCount` seeds pair off so the
 * field is trimmed to `base`. The strongest play-in seed meets the weakest, and
 * each winner inherits a seed line in the main bracket. Every match is a real
 * two-player game (no byes).
 */
export function buildPlayIn(entrantIds: string[]): BracketMatch[] {
  const n = entrantIds.length;
  const { playInCount, directEntrants } = planBracket(n);
  const matches: BracketMatch[] = [];
  for (let k = 1; k <= playInCount; k++) {
    const hiSeed = directEntrants + k; // 1-based seed entering this play-in line
    const loSeed = n + 1 - k; // 1-based seed it faces
    matches.push({
      round: 1,
      slot: k - 1,
      p1Id: entrantIds[hiSeed - 1] ?? null,
      p2Id: entrantIds[loSeed - 1] ?? null,
    });
  }
  return matches;
}

/** Pair the occupants of a `base`-line bracket using the standard seed order. */
export function buildBaseRound(round: number, occupantsBySeed: (string | null)[]): BracketMatch[] {
  const base = occupantsBySeed.length;
  const order = seedOrder(base);
  const slots = order.map(seed => occupantsBySeed[seed - 1] ?? null);
  const matches: BracketMatch[] = [];
  for (let i = 0; i < base; i += 2) {
    matches.push({ round, slot: i / 2, p1Id: slots[i], p2Id: slots[i + 1] });
  }
  return matches;
}

/**
 * The round-of-`base` (the first main round), built from the top seeds (direct
 * entrants) plus the play-in winners that filled the remaining seed lines.
 */
export function buildRoundOfBase(
  round: number,
  entrantIds: string[],
  playInWinnersBySlot: (string | null)[]
): BracketMatch[] {
  const { base, directEntrants, playInCount } = planBracket(entrantIds.length);
  const occupants: (string | null)[] = new Array(base).fill(null);
  for (let s = 1; s <= directEntrants; s++) occupants[s - 1] = entrantIds[s - 1] ?? null;
  for (let k = 1; k <= playInCount; k++) {
    occupants[directEntrants + k - 1] = playInWinnersBySlot[k - 1] ?? null;
  }
  return buildBaseRound(round, occupants);
}

/**
 * Round-1 builder used at seed time: a play-in round when the field isn't a
 * power of two, otherwise the full first round. Either way, no byes.
 */
export function buildSeedRound(entrantIds: string[]): BracketMatch[] {
  const plan = planBracket(entrantIds.length);
  return plan.playInCount > 0 ? buildPlayIn(entrantIds) : buildBaseRound(1, entrantIds);
}
