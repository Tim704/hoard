import { describe, expect, it } from 'vitest';
import {
  buildRecord,
  canWithdraw,
  parseRecommendInput,
  verdictOf,
  visibleGuess,
  waitingLabel,
  type LibraryState,
  type RecResponse,
} from '@/lib/recommendations';
import { statusLabel } from '@/lib/status';

describe('verdictOf', () => {
  it('needs a score or a drop', () => {
    expect(verdictOf(null)).toBeNull();
    expect(verdictOf({ status: 'PLANNED', rating: null })).toBeNull();
    expect(verdictOf({ status: 'COMPLETED', rating: null })).toBeNull(); // finished, not scored yet
    expect(verdictOf({ status: 'CONSUMING', rating: 6 })).toEqual({ kind: 'scored', score: 6 });
    expect(verdictOf({ status: 'DROPPED', rating: null })).toEqual({ kind: 'dropped', score: null });
    expect(verdictOf({ status: 'DROPPED', rating: 4 })).toEqual({ kind: 'dropped', score: 4 });
  });
});

describe('parseRecommendInput', () => {
  it('trims the note and turns blanks into null', () => {
    expect(parseRecommendInput({ note: '  ', guess: null })).toEqual({ ok: true, note: null, guess: null });
    expect(parseRecommendInput({ note: ' hi ', guess: 7.5 })).toEqual({ ok: true, note: 'hi', guess: 7.5 });
  });
  it('refuses a long note, a guess out of range, and non-numbers', () => {
    expect(parseRecommendInput({ note: 'x'.repeat(501) }).ok).toBe(false);
    expect(parseRecommendInput({ note: 'x'.repeat(500) }).ok).toBe(true);
    expect(parseRecommendInput({ guess: 10.5 }).ok).toBe(false);
    expect(parseRecommendInput({ guess: '7' }).ok).toBe(false);
  });
});

describe('canWithdraw', () => {
  it('only while nothing has happened', () => {
    expect(canWithdraw('PENDING', null)).toBe(true);
    expect(canWithdraw('PENDING', { status: 'PLANNED', rating: null })).toBe(true); // it was already on their list
    expect(canWithdraw('ADDED', { status: 'PLANNED', rating: null })).toBe(false);
    expect(canWithdraw('PASSED', null)).toBe(false);
    expect(canWithdraw('PENDING', { status: 'CONSUMING', rating: 5 })).toBe(false);
  });
});

describe('visibleGuess', () => {
  it('stays hidden until a verdict', () => {
    expect(visibleGuess(8, null)).toBeNull();
    expect(visibleGuess(8, { kind: 'dropped', score: null })).toBe(8);
  });
});

describe('waitingLabel', () => {
  it('describes where the pick stands, for the sender', () => {
    expect(waitingLabel('PENDING', null, 'movies')).toBe('Not answered yet');
    expect(waitingLabel('PENDING', { status: 'CONSUMING', rating: null }, 'movies')).toBe('Watching now');
    expect(waitingLabel('PENDING', { status: 'CONSUMING', rating: null }, 'books')).toBe('Reading now');
    expect(waitingLabel('PENDING', { status: 'ON_HOLD', rating: null }, 'movies')).toBe(statusLabel('ON_HOLD', 'movies'));
    expect(waitingLabel('PASSED', null, 'movies')).toBe('Passed');
    expect(waitingLabel('ADDED', null, 'movies')).toBe('Removed from their library');
    expect(waitingLabel('ADDED', { status: 'COMPLETED', rating: null }, 'movies')).toBe('Finished, not scored yet');
    expect(waitingLabel('ADDED', { status: 'PLANNED', rating: null }, 'movies')).toBe('On their list');
  });

  it('speaks to the recipient about their own list', () => {
    expect(waitingLabel('PENDING', null, 'movies', 'recipient')).toBeNull();
    expect(waitingLabel('PASSED', null, 'movies', 'recipient')).toBe('You passed');
    expect(waitingLabel('ADDED', null, 'movies', 'recipient')).toBe('Removed from your library');
    expect(waitingLabel('ADDED', { status: 'PLANNED', rating: null }, 'movies', 'recipient')).toBe('On your list');
    expect(waitingLabel('ADDED', { status: 'CONSUMING', rating: null }, 'games', 'recipient')).toBe('Playing now');
    expect(waitingLabel('ADDED', { status: 'COMPLETED', rating: null }, 'movies', 'recipient')).toBe('Finished, not scored yet');
  });
});

describe('buildRecord', () => {
  const row = (id: string, response: RecResponse, guess: number | null, recipient: LibraryState | null) =>
    ({ id, response, guess, recipient, createdAt: new Date(`2026-11-0${id}`) });
  it('counts, averages and picks best and worst by the recipient score', () => {
    const r = buildRecord([
      row('1', 'ADDED', 8, { status: 'COMPLETED', rating: 9 }),
      row('2', 'ADDED', null, { status: 'DROPPED', rating: 3 }),
      row('3', 'ADDED', 5, { status: 'DROPPED', rating: null }),
      row('4', 'PASSED', 7, null),
      row('5', 'PENDING', 7, null),
    ]);
    expect(r).toEqual({ sent: 5, added: 3, finished: 1, passed: 1, averageScore: 6, averageGuessMiss: 1, bestId: '1', worstId: '2' });
  });
  it('is empty without verdicts', () => {
    expect(buildRecord([])).toEqual({ sent: 0, added: 0, finished: 0, passed: 0, averageScore: null, averageGuessMiss: null, bestId: null, worstId: null });
  });
  it('breaks score ties towards the newest pick', () => {
    const r = buildRecord([row('1', 'ADDED', null, { status: 'COMPLETED', rating: 7 }), row('2', 'ADDED', null, { status: 'COMPLETED', rating: 7 })]);
    expect(r.bestId).toBe('2');
    expect(r.worstId).toBe('2');
  });
});
