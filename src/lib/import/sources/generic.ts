// ───────────────────────────────────────────────────────────────────────────
//  Any other CSV (spec 2.7), Backloggd community exports included: the user
//  maps columns to title, year, section, status, rating, platform and date,
//  then maps each distinct status value to a Hoard status. Pure; the mapping
//  screen lives in src/components/import/generic-mapper.tsx.
//
//  The mapping is remembered per set of headers (`headerSignature`), in the
//  browser's localStorage: a per-device convenience only, so every read and
//  write is guarded and a bad or stale entry is simply ignored.
//
//  Platforms are kept as tags for now (the owned-platforms column comes
//  later). A date is the finish day for finished / dropped / retired rows and
//  the start day for ongoing / paused ones.
// ───────────────────────────────────────────────────────────────────────────

import { CATEGORIES, isCategorySlug, type CategorySlug } from '@/lib/categories';
import { normalizeRating } from '@/lib/rating';
import { isStatus, type Status } from '@/lib/status';

import { parseDay, parseYear, splitList, text } from '../fields';
import { dedupeRows, type ParseResult } from '../rows';
import type { ImportRow } from '../types';

export const GENERIC_FIELDS = ['title', 'year', 'section', 'status', 'rating', 'platform', 'date'] as const;
export type GenericField = (typeof GENERIC_FIELDS)[number];

export type RatingScale = 5 | 10 | 100;
export const RATING_SCALES: RatingScale[] = [5, 10, 100];

/** What a status value becomes: a Hoard status, or 'skip' (leave those rows out). */
export type StatusChoice = Status | 'skip';

export interface GenericMapping {
  /** Field → header name (absent = not in the file). */
  columns: Partial<Record<GenericField, string>>;
  /** The section for every row, or for rows whose section cell is unknown. */
  section: CategorySlug | null;
  scale: RatingScale;
  /** Normalised status value (`statusKey`) → choice. */
  statusMap: Record<string, StatusChoice>;
  /** For rows without a status cell (or no status column). */
  defaultStatus: Status;
}

/** Header names that suggest each field (lower-case, compared after trimming). */
const GUESSES: Record<GenericField, string[]> = {
  title: ['title', 'name', 'game', 'game title', 'game name', 'movie', 'film', 'book', 'series', 'show'],
  year: ['year', 'release year', 'released', 'release date', 'year released'],
  section: ['section', 'category', 'type', 'media type', 'medium', 'kind'],
  status: ['status', 'state', 'progress', 'shelf', 'list', 'played status'],
  rating: ['rating', 'score', 'stars', 'my rating', 'your rating', 'rating (out of 10)'],
  platform: ['platform', 'platforms', 'console', 'system', 'played on'],
  date: ['date', 'finished', 'completed', 'completed on', 'finished on', 'date finished', 'date completed', 'date played', 'played on date', 'watched date', 'date read'],
};

/** The identity of a header set: case- and order-insensitive. */
export function headerSignature(headers: string[]): string {
  return [...new Set(headers.map((h) => h.trim().toLowerCase()).filter(Boolean))].sort().join('\u001f');
}

/** A first guess at the mapping from the header names alone. */
export function guessMapping(headers: string[]): GenericMapping {
  const columns: GenericMapping['columns'] = {};
  const used = new Set<string>();
  for (const field of GENERIC_FIELDS) {
    const hit = GUESSES[field]
      .map((g) => headers.find((h) => !used.has(h) && h.trim().toLowerCase() === g))
      .find(Boolean);
    if (hit) {
      columns[field] = hit;
      used.add(hit);
    }
  }
  return { columns, section: null, scale: 10, statusMap: {}, defaultStatus: 'COMPLETED' };
}

/** A status cell's key in `statusMap`: trimmed, lower-case, spaces collapsed. */
export function statusKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

/** Status words and what they mean, first match wins (order matters). */
const STATUS_WORDS: Array<[RegExp, Status]> = [
  [/\b(retired|shelved)\b/, 'RETIRED'],
  [/\b(abandoned|dropped|did not finish|dnf|quit)\b/, 'DROPPED'],
  [/\b(paused|on hold|hold)\b/, 'ON_HOLD'],
  [/\b(backlog|wishlist|wish list|plan|planned|plan to \w+|want|want to \w+|to read|to watch|to play|unplayed|queued?)\b/, 'PLANNED'],
  [/\b(playing|watching|reading|listening|in progress|current(ly)?|ongoing|started)\b/, 'CONSUMING'],
  [/\b(played|completed?|beaten|finished|done|watched|read|listened|mastered)\b/, 'COMPLETED'],
];

/** A sensible default for a status value ("Beaten" → Completed, "Shelved" → Retired), or null. */
export function defaultStatusFor(value: string): Status | null {
  const key = statusKey(value);
  if (!key) return null;
  const upper = key.toUpperCase().replace(/ /g, '_');
  if (isStatus(upper)) return upper;
  for (const [re, status] of STATUS_WORDS) if (re.test(key)) return status;
  return null;
}

/** The distinct non-empty values of one column, first-seen order (at most `max`). */
export function distinctValues(records: Record<string, string>[], column: string | undefined, max = 60): string[] {
  if (!column) return [];
  const seen = new Map<string, string>();
  for (const r of records) {
    const v = (r[column] ?? '').trim();
    if (!v) continue;
    const k = statusKey(v);
    if (!seen.has(k)) seen.set(k, v);
    if (seen.size >= max) break;
  }
  return [...seen.values()];
}

/**
 * The status map for `values`: a remembered choice when there is one, else
 * the default for the word, else the mapping's default status.
 */
export function buildStatusMap(values: string[], previous: Record<string, StatusChoice> = {}, fallback: Status = 'COMPLETED'): Record<string, StatusChoice> {
  const out: Record<string, StatusChoice> = {};
  for (const v of values) {
    const k = statusKey(v);
    out[k] = previous[k] ?? defaultStatusFor(v) ?? fallback;
  }
  return out;
}

const SECTION_WORDS: Array<[RegExp, CategorySlug]> = [
  [/^(video ?games?|games?|vg)$/, 'games'],
  [/^(movies?|films?|feature)$/, 'movies'],
  [/^(tv|tv ?shows?|shows?|series|tv series)$/, 'tv'],
  [/^(books?|novels?|ebooks?|audiobooks?)$/, 'books'],
  [/^(anime)$/, 'anime'],
  [/^(manga|manhwa|manhua|comics?|light novels?)$/, 'manga'],
  [/^(music|albums?|records?)$/, 'music'],
];

/** A section cell ("Game", "TV Shows", "manga", a slug) → the section, or null. */
export function sectionFromCell(cell: string | undefined): CategorySlug | null {
  const v = (cell ?? '').trim().toLowerCase();
  if (!v) return null;
  if (isCategorySlug(v)) return v;
  for (const c of Object.values(CATEGORIES)) {
    if (v === c.label.toLowerCase() || v === c.singular.toLowerCase()) return c.slug;
  }
  for (const [re, slug] of SECTION_WORDS) if (re.test(v)) return slug;
  return null;
}

/** A rating cell on `scale` → 0–10 (one decimal); empty, 0 and out-of-range → undefined. */
export function scaledRating(cell: string | undefined, scale: RatingScale): number | undefined {
  const t = (cell ?? '').trim().replace(',', '.').replace(/[★⭐%]|\/\s*\d+$/g, '').trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > scale) return undefined;
  return normalizeRating((n * 10) / scale) ?? undefined;
}

const FINISHED_LIKE = new Set<Status>(['COMPLETED', 'DROPPED', 'RETIRED']);
const STARTED_LIKE = new Set<Status>(['CONSUMING', 'ON_HOLD']);

/** Records + mapping → rows. Rows without a title, a section, or whose status is "skip" are skipped. */
export function mapGenericRecords(records: Record<string, string>[], m: GenericMapping): ParseResult {
  const rows: ImportRow[] = [];
  let skipped = 0;
  let noSection = 0;
  const cell = (r: Record<string, string>, f: GenericField) => (m.columns[f] ? r[m.columns[f]!] ?? '' : '');
  for (const r of records) {
    const title = text(cell(r, 'title'));
    const category = sectionFromCell(cell(r, 'section')) ?? m.section;
    const rawStatus = cell(r, 'status').trim();
    const choice: StatusChoice = rawStatus ? m.statusMap[statusKey(rawStatus)] ?? defaultStatusFor(rawStatus) ?? m.defaultStatus : m.defaultStatus;
    if (!title || !category || choice === 'skip') {
      skipped++;
      if (title && !category) noSection++;
      continue;
    }
    const row: ImportRow = { source: 'generic', category, title, ids: {}, status: choice };
    const yearCell = cell(r, 'year');
    const year = parseYear(yearCell) ?? parseYear(parseDay(yearCell)?.slice(0, 4));
    if (year) row.year = year;
    const rating = scaledRating(cell(r, 'rating'), m.scale);
    if (rating !== undefined) row.rating = rating;
    const tags = splitList(cell(r, 'platform'), /[,;|]/);
    if (tags.length) row.tags = tags;
    const day = parseDay(cell(r, 'date'));
    if (day && FINISHED_LIKE.has(choice)) row.finishedOn = day;
    else if (day && STARTED_LIKE.has(choice)) row.startedOn = day;
    rows.push(row);
  }
  const warnings = noSection
    ? [`${noSection} row${noSection === 1 ? '' : 's'} had no recognisable section. Pick a section for them and try again.`]
    : [];
  return { rows: dedupeRows(rows), skipped, warnings };
}

// ── Remembering the mapping (per device) ────────────────────────────────────

/** The bit of Storage the memory needs (window.localStorage in the browser). */
export type MappingStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const MAPPING_KEY_PREFIX = 'hoard.import.csv-mapping:';

const STATUS_CHOICES = new Set<string>(['skip', 'PLANNED', 'CONSUMING', 'COMPLETED', 'ON_HOLD', 'RETIRED', 'DROPPED']);

/**
 * A stored mapping, checked against the headers it is used with: columns that
 * are no longer in the file are dropped, and anything malformed gives null.
 */
export function restoreMapping(raw: unknown, headers: string[]): GenericMapping | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const columns: GenericMapping['columns'] = {};
  if (o.columns && typeof o.columns === 'object') {
    for (const f of GENERIC_FIELDS) {
      const h = (o.columns as Record<string, unknown>)[f];
      if (typeof h === 'string' && headers.includes(h)) columns[f] = h;
    }
  }
  const section = typeof o.section === 'string' && isCategorySlug(o.section) ? o.section : null;
  const scale = RATING_SCALES.includes(o.scale as RatingScale) ? (o.scale as RatingScale) : 10;
  const defaultStatus = typeof o.defaultStatus === 'string' && isStatus(o.defaultStatus) ? o.defaultStatus : 'COMPLETED';
  const statusMap: Record<string, StatusChoice> = {};
  if (o.statusMap && typeof o.statusMap === 'object') {
    for (const [k, v] of Object.entries(o.statusMap as Record<string, unknown>)) {
      if (typeof v === 'string' && STATUS_CHOICES.has(v) && k.length <= 200) statusMap[k] = v as StatusChoice;
    }
  }
  return { columns, section, scale, statusMap, defaultStatus };
}

/** The remembered mapping for these headers, or null (never throws). */
export function loadMapping(storage: MappingStorage | null | undefined, headers: string[]): GenericMapping | null {
  try {
    const text = storage?.getItem(MAPPING_KEY_PREFIX + headerSignature(headers));
    return text ? restoreMapping(JSON.parse(text), headers) : null;
  } catch {
    return null;
  }
}

/** Remember the mapping for these headers (best effort; full or blocked storage is ignored). */
export function saveMapping(storage: MappingStorage | null | undefined, headers: string[], mapping: GenericMapping): void {
  try {
    storage?.setItem(MAPPING_KEY_PREFIX + headerSignature(headers), JSON.stringify(mapping));
  } catch {
    // Private window, quota, blocked storage: the mapping just isn't remembered.
  }
}

/** The mapping to start from: the remembered one, else a guess from the headers. */
export function initialMapping(storage: MappingStorage | null | undefined, headers: string[]): { mapping: GenericMapping; remembered: boolean } {
  const saved = loadMapping(storage, headers);
  return saved ? { mapping: saved, remembered: true } : { mapping: guessMapping(headers), remembered: false };
}
