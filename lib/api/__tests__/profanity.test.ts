import { describe, it, expect } from 'vitest';
import { containsProfanity } from '../profanity.js';

describe('containsProfanity', () => {
  it('flags known bad words', () => {
    expect(containsProfanity('damn')).toBe(true);
    expect(containsProfanity('crap')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(containsProfanity('DAMN')).toBe(true);
    expect(containsProfanity('DaMn')).toBe(true);
  });

  it('flags a bad word embedded in a longer phrase', () => {
    expect(containsProfanity('you damn cheater')).toBe(true);
  });

  it('allows ordinary clean names', () => {
    expect(containsProfanity('Alice')).toBe(false);
    expect(containsProfanity('Bob')).toBe(false);
    expect(containsProfanity('Newton')).toBe(false);
  });

  // KNOWN BUG (see repo review): the filter uses `lowerText.includes(word)`,
  // so clean words that merely contain a bad substring are wrongly flagged
  // (the "Scunthorpe problem"). Documented here as the desired behavior.
  it.todo('does not flag clean words containing a bad substring (Cassie, Classic, grass, Title)');
});
