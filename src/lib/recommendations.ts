// ───────────────────────────────────────────────────────────────────────────
//  Recommendation rules — pure and client-safe (no prisma import).
//
//  A recommendation stores only who, what, a note and the sender's guess. The
//  recipient's outcome is never copied: callers read their library state and
//  these helpers turn it into a verdict, a status line and the sender's record.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from './categories';
import { normalizeRating } from './rating';
import { statusLabel, type Status } from './status';

export const NOTE_MAX = 500;

export type RecResponse = 'PENDING' | 'ADDED' | 'PASSED';

/** The recipient's library entry for the title, or null when it isn't there. */
export interface LibraryState {
  status: Status;
  rating: number | null;
}

/** A verdict exists once the title-level score is set or the title was dropped. */
export type Verdict = { kind: 'scored'; score: number } | { kind: 'dropped'; score: number | null };

export function verdictOf(recipient: LibraryState | null): Verdict | null {
  if (!recipient) return null;
  if (recipient.status === 'DROPPED') return { kind: 'dropped', score: recipient.rating };
  if (recipient.rating != null) return { kind: 'scored', score: recipient.rating };
  return null;
}

export type ParsedRecommendInput =
  | { ok: true; note: string | null; guess: number | null }
  | { ok: false; error: string };

export function parseRecommendInput(input: { note?: unknown; guess?: unknown }): ParsedRecommendInput {
  let note: string | null = null;
  if (input.note != null) {
    if (typeof input.note !== 'string') return { ok: false, error: 'Note must be text.' };
    const trimmed = input.note.trim();
    if (trimmed.length > NOTE_MAX) return { ok: false, error: `Note can be at most ${NOTE_MAX} characters.` };
    note = trimmed === '' ? null : trimmed;
  }
  let guess: number | null = null;
  if (input.guess != null) {
    if (typeof input.guess !== 'number') return { ok: false, error: 'Guess must be a number from 0 to 10.' };
    guess = normalizeRating(input.guess);
    if (guess == null) return { ok: false, error: 'Guess must be a number from 0 to 10.' };
  }
  return { ok: true, note, guess };
}

/** The sender can take a pick back only while nothing has happened to it. */
export function canWithdraw(response: RecResponse, recipient: LibraryState | null): boolean {
  return response === 'PENDING' && verdictOf(recipient) === null;
}

/** The sender's guess is shown to the recipient only once a verdict exists. */
export function visibleGuess(guess: number | null, verdict: Verdict | null): number | null {
  return verdict ? guess : null;
}

/**
 * Where a pick stands while there is no verdict yet, in plain words from the
 * viewer's side: the sender reads about "their list", the recipient about
 * "your list". Null when there is nothing to say (a recipient's open pick).
 */
export function waitingLabel(
  response: RecResponse,
  recipient: LibraryState | null,
  slug: CategorySlug,
  viewer: 'sender' | 'recipient' = 'sender',
): string | null {
  const their = viewer === 'sender';
  if (response === 'PASSED') return their ? 'Passed' : 'You passed';
  if (!recipient) {
    if (response === 'ADDED') return their ? 'Removed from their library' : 'Removed from your library';
    return their ? 'Not answered yet' : null;
  }
  switch (recipient.status) {
    case 'COMPLETED':
    case 'RETIRED':
      return 'Finished, not scored yet';
    case 'PLANNED':
      return their ? 'On their list' : 'On your list';
    case 'CONSUMING':
      return `${statusLabel('CONSUMING', slug)} now`;
    default:
      return statusLabel(recipient.status, slug);
  }
}

export interface RecordRow {
  id: string;
  response: RecResponse;
  guess: number | null;
  recipient: LibraryState | null;
  createdAt: Date;
}

export interface RecommendationRecord {
  sent: number;
  added: number;
  finished: number;
  passed: number;
  averageScore: number | null;
  averageGuessMiss: number | null;
  bestId: string | null;
  worstId: string | null;
}

const average = (values: number[]): number | null =>
  values.length === 0 ? null : normalizeRating(values.reduce((a, b) => a + b, 0) / values.length);

/** The sender's track record across all their picks to one friend. */
export function buildRecord(rows: RecordRow[]): RecommendationRecord {
  const scored: { id: string; score: number; at: number }[] = [];
  const misses: number[] = [];
  let added = 0;
  let finished = 0;
  let passed = 0;

  for (const row of rows) {
    if (row.response === 'ADDED') added += 1;
    if (row.response === 'PASSED') passed += 1;
    if (row.recipient?.status === 'COMPLETED' || row.recipient?.status === 'RETIRED') finished += 1;
    const score = verdictOf(row.recipient)?.score ?? null;
    if (score == null) continue;
    scored.push({ id: row.id, score, at: row.createdAt.getTime() });
    if (row.guess != null) misses.push(Math.abs(row.guess - score));
  }

  // Ties go to the newest pick.
  const newestFirst = [...scored].sort((a, b) => b.at - a.at);
  let best: (typeof scored)[number] | null = null;
  let worst: (typeof scored)[number] | null = null;
  for (const s of newestFirst) {
    if (!best || s.score > best.score) best = s;
    if (!worst || s.score < worst.score) worst = s;
  }

  return {
    sent: rows.length,
    added,
    finished,
    passed,
    averageScore: average(scored.map((s) => s.score)),
    averageGuessMiss: average(misses),
    bestId: best?.id ?? null,
    worstId: worst?.id ?? null,
  };
}
