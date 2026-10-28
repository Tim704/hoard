// ───────────────────────────────────────────────────────────────────────────
//  Manual entries (spec 1.5): titles the providers don't know, typed in by the
//  user. Each manual add creates its own catalogue row with
//  `externalId = "manual:<id>"`, so editing it never touches anyone else's
//  data. Provider refreshes and franchise resolution skip these rows
//  (`isLookupSkipped`); title-based franchise grouping still applies.
//
//  Pure and client-safe: the form reads `MANUAL_FIELDS`, the server actions
//  validate with `parseManualInput`.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from './categories';
import type { NormalizedResult } from './types';

export const MANUAL_PREFIX = 'manual:';

export function isManualId(externalId: string): boolean {
  return externalId.startsWith(MANUAL_PREFIX);
}

/** A medium-specific field on the manual form. */
export interface ManualField {
  key: string;
  label: string;
  /** int: a whole number; list: comma-separated names; text: one line. */
  kind: 'int' | 'list' | 'text';
}

/** The medium's counts (and the names that identify it) per section. */
export const MANUAL_FIELDS: Record<CategorySlug, ManualField[]> = {
  books: [
    { key: 'authors', label: 'Authors (comma-separated)', kind: 'list' },
    { key: 'pageCount', label: 'Pages', kind: 'int' },
  ],
  movies: [{ key: 'runtime', label: 'Runtime (minutes)', kind: 'int' }],
  tv: [
    { key: 'episodeCount', label: 'Episodes', kind: 'int' },
    { key: 'seasonCount', label: 'Seasons', kind: 'int' },
  ],
  anime: [{ key: 'episodes', label: 'Episodes', kind: 'int' }],
  manga: [
    { key: 'chapters', label: 'Chapters', kind: 'int' },
    { key: 'volumes', label: 'Volumes', kind: 'int' },
  ],
  games: [{ key: 'platforms', label: 'Platforms (comma-separated)', kind: 'list' }],
  music: [
    { key: 'artist', label: 'Artist', kind: 'text' },
    { key: 'trackCount', label: 'Tracks', kind: 'int' },
  ],
};

/** The form's raw values: everything arrives as text. */
export type ManualInput = Record<string, string | null | undefined>;

export type ManualParse =
  | { ok: true; fields: Record<string, unknown> }
  | { ok: false; error: string };

const MAX_COUNT = 1_000_000;

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** An https URL (the only scheme a cover may use), or the reason it isn't one. */
export function coverUrlProblem(raw: string): string | null {
  if (raw.length > 1000) return 'The cover URL is too long.';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'The cover URL is not a valid link.';
  }
  if (url.protocol !== 'https:') return 'The cover URL must start with https://.';
  if (!url.hostname) return 'The cover URL is not a valid link.';
  return null;
}

/**
 * Validate the form for `slug` and return the media-row columns it sets. Every
 * column the form owns is present (null / [] when left empty), so the result
 * is both a `create` payload and a full `update` that can clear values.
 */
export function parseManualInput(slug: CategorySlug, raw: unknown): ManualParse {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const title = clean(input.title);
  if (!title) return { ok: false, error: 'A title is required.' };
  if (title.length > 300) return { ok: false, error: 'The title is too long.' };

  let year: number | null = null;
  const yearText = clean(input.year);
  if (yearText) {
    year = Number(yearText);
    if (!/^\d{4}$/.test(yearText) || year < 1000 || year > 2100) {
      return { ok: false, error: 'The year must be a four-digit year.' };
    }
  }

  const imageUrl = clean(input.imageUrl) || null;
  if (imageUrl) {
    const problem = coverUrlProblem(imageUrl);
    if (problem) return { ok: false, error: problem };
  }

  const description = clean(input.description) || null;
  if (description && description.length > 5000) {
    return { ok: false, error: 'The description is too long.' };
  }

  const fields: Record<string, unknown> = { title, year, imageUrl, description };
  for (const field of MANUAL_FIELDS[slug] ?? []) {
    const text = clean(input[field.key]);
    if (field.kind === 'int') {
      if (!text) {
        fields[field.key] = null;
        continue;
      }
      const n = Number(text);
      if (!/^\d+$/.test(text) || n > MAX_COUNT) {
        return { ok: false, error: `${field.label} must be a whole number.` };
      }
      fields[field.key] = n;
    } else if (field.kind === 'list') {
      const items = text
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (items.length > 30 || items.some((s) => s.length > 200)) {
        return { ok: false, error: `${field.label.replace(/ \(.*\)$/, '')}: too many or too long.` };
      }
      fields[field.key] = [...new Set(items)];
    } else {
      if (text.length > 200) return { ok: false, error: `${field.label} is too long.` };
      fields[field.key] = text || null;
    }
  }
  return { ok: true, fields };
}

/** The form's starting values for an existing manual row (the edit form). */
export function manualInputFrom(slug: CategorySlug, media: Record<string, unknown>): ManualInput {
  const text = (v: unknown) =>
    Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
  const out: ManualInput = {
    title: text(media.title),
    year: text(media.year),
    imageUrl: text(media.imageUrl),
    description: text(media.description),
  };
  for (const field of MANUAL_FIELDS[slug] ?? []) out[field.key] = text(media[field.key]);
  return out;
}

/** A new manual row as a search hit, so it takes the normal add path. */
export function manualResult(
  externalId: string,
  fields: Record<string, unknown>,
): NormalizedResult {
  return {
    externalId,
    title: String(fields.title),
    imageUrl: (fields.imageUrl as string | null) ?? null,
    subtitle: null,
    year: (fields.year as number | null) ?? null,
    description: (fields.description as string | null) ?? null,
    fields: { ...fields, externalId },
  };
}
