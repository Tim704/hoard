// ───────────────────────────────────────────────────────────────────────────
//  The add path's catalogue writes (spec G2). Server-only.
//
//  A search hit's `fields` arrive from the client (a hit it was handed), so
//  they are never trusted with a shared row:
//  - only the model's own SCALAR columns are ever written (an allow-list from
//    `Prisma.<Model>ScalarFieldEnum`), so relation keys (`activities`,
//    `seasons`, …) and their nested `create` / `connect` shapes can never
//    reach Prisma — a nested write would touch another user's library;
//  - identity and bookkeeping columns are server-owned (SERVER_OWNED);
//  - every value must fit its column: primitives only (strings capped, finite
//    in-range numbers, ISO dates), arrays of strings only for `String[]`;
//  - a cover must be https on a provider CDN (src/lib/img-proxy.ts); a hand-made
//    (`manual:`) row only needs https — it is that user's own row;
//  - an EXISTING row only has its empty columns filled in. Refreshing stored
//    values is the metadata job's job (server-side fetches).
// ───────────────────────────────────────────────────────────────────────────

import { Prisma } from '@prisma/client';

import type { PrismaModel } from '@/lib/categories';
import { allowedImageUrl } from '@/lib/img-proxy';
import { isManualId } from '@/lib/manual';

/**
 * Drops empty values from a search hit's columns (the input of fillOnlyUpdate
 * below). A search hit is often thinner than the stored row (no book
 * description, runtime / episode counts null when enrichment failed, no
 * genres), so re-adding or re-searching a title must never overwrite stored
 * data with nothing: null, undefined, empty strings and empty arrays are
 * dropped. Clearing a value (e.g. a show's next air date) is the metadata
 * job's job.
 */
export function upsertUpdatePayload(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

/** Columns a client payload may never set: identity, grouping, job bookkeeping. */
const SERVER_OWNED = new Set([
  'id',
  'externalId',
  'createdAt',
  'franchiseKey',
  'franchiseName',
  // Metadata-job bookkeeping: a forged future metaFetchedAt would hide a row
  // from the job forever. The add path stamps it server-side instead.
  'metaFetchedAt',
  'metaFailedAt',
]);

// ── The allow-list ──────────────────────────────────────────────────────────

interface Column {
  type: string; // Prisma scalar type: String, Int, Float, Boolean, DateTime, …
  list: boolean;
}

const MODEL_NAMES: Record<PrismaModel, string> = {
  book: 'Book',
  movie: 'Movie',
  tvShow: 'TvShow',
  anime: 'Anime',
  manga: 'Manga',
  videoGame: 'VideoGame',
  musicAlbum: 'MusicAlbum',
};

const columnCache = new Map<PrismaModel, ReadonlyMap<string, Column>>();

/**
 * The writable columns of a catalogue model: its scalar columns (from
 * `Prisma.<Model>ScalarFieldEnum`, typed from the DMMF) minus SERVER_OWNED.
 */
export function writableColumns(model: PrismaModel): ReadonlyMap<string, Column> {
  const cached = columnCache.get(model);
  if (cached) return cached;
  const name = MODEL_NAMES[model];
  if (!name) throw new Error(`Not a catalogue model: ${String(model)}`);
  const scalarEnum = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[`${name}ScalarFieldEnum`];
  const dmmf = Prisma.dmmf.datamodel.models.find((m) => m.name === name);
  if (!scalarEnum || !dmmf) throw new Error(`No Prisma metadata for ${name}`);
  const scalars = new Set(Object.values(scalarEnum));
  const out = new Map<string, Column>();
  for (const f of dmmf.fields) {
    if (f.kind !== 'scalar' || !scalars.has(f.name) || SERVER_OWNED.has(f.name)) continue;
    out.set(f.name, { type: f.type, list: f.isList });
  }
  columnCache.set(model, out);
  return out;
}

// ── Value rules ─────────────────────────────────────────────────────────────

const MAX_TITLE = 500;
const MAX_DESCRIPTION = 10_000;
const MAX_URL = 2000;
const MAX_TEXT = 500;
const MAX_LIST_ITEMS = 100;
const INT_MAX = 2_147_483_647;
const FLOAT_MAX = 1e12;

/** Image columns: https on a provider CDN, or null. */
const IMAGE_COLUMNS = new Set(['imageUrl', 'backdropUrl']);

const DROP = Symbol('drop');

function cap(key: string): number {
  if (key === 'title') return MAX_TITLE;
  if (key === 'description') return MAX_DESCRIPTION;
  if (IMAGE_COLUMNS.has(key) || /url$/i.test(key)) return MAX_URL;
  return MAX_TEXT;
}

/** An image URL, or null when it is not https (and, for shared rows, not a provider CDN). */
export function safeImageUrl(value: unknown, manual: boolean): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > MAX_URL) return null;
  if (!manual) return allowedImageUrl(raw) ? raw : null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return raw;
  } catch {
    return null;
  }
}

function cleanScalar(key: string, col: Column, value: unknown, manual: boolean): unknown {
  if (IMAGE_COLUMNS.has(key)) return safeImageUrl(value, manual);
  if (value === null) return key === 'title' ? DROP : null;
  switch (col.type) {
    case 'String':
      return typeof value === 'string' ? value.slice(0, cap(key)) : DROP;
    case 'Int':
      return typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= INT_MAX ? value : DROP;
    case 'Float':
      return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= FLOAT_MAX ? value : DROP;
    case 'Boolean':
      return typeof value === 'boolean' ? value : DROP;
    case 'DateTime': {
      const d =
        value instanceof Date ? value : typeof value === 'string' && value.length <= 40 ? new Date(value) : null;
      if (!d || Number.isNaN(d.getTime())) return DROP;
      const y = d.getUTCFullYear();
      return y >= 1800 && y <= 2200 ? d : DROP;
    }
    default:
      return DROP; // Json, BigInt, Decimal, Bytes, enums: never from a client
  }
}

function cleanValue(key: string, col: Column, value: unknown, manual: boolean): unknown {
  if (value === undefined) return DROP;
  if (col.list) {
    if (col.type !== 'String' || !Array.isArray(value)) return DROP;
    return value
      .filter((v): v is string => typeof v === 'string')
      .slice(0, MAX_LIST_ITEMS)
      .map((v) => v.slice(0, MAX_TEXT));
  }
  return cleanScalar(key, col, value, manual);
}

/**
 * The allow-listed, value-checked columns of `fields` for `model` (see the
 * header). Anything else — relation keys, nested objects, unknown or
 * server-owned columns, wrongly typed values — is dropped.
 */
export function sanitizeCatalogueFields(
  model: PrismaModel,
  fields: Record<string, unknown>,
  opts: { manual: boolean },
): Record<string, unknown> {
  const cols = writableColumns(model);
  const out: Record<string, unknown> = {};
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return out;
  for (const [key, value] of Object.entries(fields)) {
    const col = cols.get(key);
    if (!col) continue;
    const clean = cleanValue(key, col, value, opts.manual);
    if (clean !== DROP) out[key] = clean;
  }
  return out;
}

const isEmpty = (v: unknown) =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

/**
 * The `create` payload for a new catalogue row: the allow-listed columns of
 * the client's `fields`, with `externalId` pinned to the id the row is keyed
 * by (so `fields.externalId` can never smuggle in e.g. a "manual:" id) and a
 * title always present (`fallbackTitle`, the validated hit title).
 */
export function catalogueCreatePayload(
  model: PrismaModel,
  externalId: string,
  fields: Record<string, unknown>,
  fallbackTitle?: string,
): Record<string, unknown> {
  const out = sanitizeCatalogueFields(model, fields, { manual: isManualId(externalId) });
  if (typeof out.title !== 'string' || !out.title.trim()) {
    out.title = (fallbackTitle ?? '').slice(0, MAX_TITLE) || 'Untitled';
  }
  out.externalId = externalId;
  return out;
}

/**
 * The fill-only `update` for an EXISTING catalogue row: only allow-listed
 * columns that are stored empty (null, blank, []) and arrive non-empty.
 * Stored values are never overwritten, so no user can rename or re-cover a
 * title for everyone.
 */
export function fillOnlyUpdate(
  model: PrismaModel,
  existing: Record<string, unknown>,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const manual = typeof existing.externalId === 'string' && isManualId(existing.externalId);
  const clean = upsertUpdatePayload(sanitizeCatalogueFields(model, fields, { manual }));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(clean)) {
    if (!(key in existing)) continue;
    if (isEmpty(existing[key])) out[key] = value;
  }
  return out;
}
