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

/** How scores are shown (input always stays on the 0–10 scale). */
export type ScoreFormat = 'ten' | 'five' | 'hundred';

export interface ScoreOptions {
  /** Append ★ in the five format (default true). Pass false where a star icon is already drawn. */
  star?: boolean;
}

/**
 * Show a 0–10 score in the user's format, or an em dash when unrated:
 * ten "8.5" (one decimal), five "4.3★" (score/2 to one decimal), hundred "85".
 */
export function formatScore(
  v: number | null,
  format: ScoreFormat = 'ten',
  { star = true }: ScoreOptions = {},
): string {
  if (v === null || !Number.isFinite(v)) return '—';
  switch (format) {
    case 'five':
      // round1 on the tenths avoids 8.5/2 = 4.25 rounding down through float error.
      return `${(Math.round(Math.round(v * 10) / 2) / 10).toFixed(1)}${star ? '★' : ''}`;
    case 'hundred':
      return String(Math.round(v * 10));
    default:
      return round1(v).toFixed(1);
  }
}

/**
 * Like formatScore, with the scale: "8.5/10", "4.3★", "85/100". With
 * `star: false` the five format reads "4.3/5" (for places with a star icon).
 */
export function formatScoreOutOf(
  v: number | null,
  format: ScoreFormat = 'ten',
  { star = true }: ScoreOptions = {},
): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const s = formatScore(v, format, { star });
  if (format === 'ten') return `${s}/10`;
  if (format === 'hundred') return `${s}/100`;
  return star ? s : `${s}/5`;
}

/** "8.0", "7.5", or an em dash when unrated (the 0–10 format, used by inputs). */
export function formatRating(v: number | null): string {
  return formatScore(v, 'ten');
}

/**
 * A signed difference between two 0–10 scores in the user's format:
 * ten "+1.5", five "+0.8" (half), hundred "+15"; "±0" for no difference.
 * Uses a real minus sign (−) for negatives.
 */
export function formatScoreDiff(diff: number, format: ScoreFormat = 'ten'): string {
  if (!Number.isFinite(diff)) return '—';
  const tenths = Math.round(diff * 10);
  if (tenths === 0) return '±0';
  const sign = tenths > 0 ? '+' : '−';
  const abs = Math.abs(tenths);
  switch (format) {
    case 'five':
      return sign + (Math.round(abs / 2) / 10).toFixed(1);
    case 'hundred':
      return sign + String(abs);
    default:
      return sign + (abs / 10).toFixed(1);
  }
}
