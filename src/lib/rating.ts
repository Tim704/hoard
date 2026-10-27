// ───────────────────────────────────────────────────────────────────────────
//  Rating helpers — pure functions for one-decimal 0–10 scores.
//
//  Scores are stored and shown with a single decimal place (e.g. 7.5). These
//  helpers normalise, parse, nudge and format them so the rest of the app never
//  deals with float drift (7.9 + 0.1 = 8, not 7.999…) or out-of-range values.
// ───────────────────────────────────────────────────────────────────────────

export const RATING_MIN = 0;
export const RATING_MAX = 10;

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Round to 1 decimal. Returns null if not finite or outside 0–10 after rounding. */
export function normalizeRating(v: number): number | null {
  if (!Number.isFinite(v)) return null;
  const r = round1(v);
  return r < RATING_MIN || r > RATING_MAX ? null : r;
}

/** Parse user text ("8,5", " 7.25 "). Null for empty, invalid or out of range. */
export function parseRatingInput(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  return normalizeRating(Number(t));
}

/** Add `delta` to a rating (null counts as 0), clamped to 0–10 at 1 decimal. */
export function nudgeRating(v: number | null, delta: number): number {
  const next = round1((v ?? 0) + delta);
  return Math.min(RATING_MAX, Math.max(RATING_MIN, next));
}

/** "8.0", "7.5", or an em dash when unrated. */
export function formatRating(v: number | null): string {
  return v === null ? '—' : v.toFixed(1);
}
