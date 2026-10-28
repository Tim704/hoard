// Drops empty values from a search hit's columns (the input of fillOnlyUpdate
// below). A search hit is often thinner than the stored row (no book
// description, runtime / episode counts null when enrichment failed, no
// genres), so re-adding or re-searching a title must never overwrite stored
// data with nothing: null, undefined, empty strings and empty arrays are
// dropped. Clearing a value (e.g. a show's next air date) is the metadata
// job's job.

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

// ── The add path's catalogue writes (spec G2) ──────────────────────────────
//  `fields` arrive from the client (a search hit it was handed), so they are
//  never trusted with a shared row: the row's identity and bookkeeping columns
//  are server-owned, and an EXISTING row only has its empty columns filled in.
//  Refreshing stored values is the metadata job's job (server-side fetches).

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

const isEmpty = (v: unknown) =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

/**
 * The `create` payload for a new catalogue row: the client's columns minus the
 * server-owned ones, with `externalId` pinned to the id the row is keyed by
 * (so `fields.externalId` can never smuggle in e.g. a "manual:" id).
 */
export function catalogueCreatePayload(
  externalId: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!SERVER_OWNED.has(key)) out[key] = value;
  }
  out.externalId = externalId;
  return out;
}

/**
 * The fill-only `update` for an EXISTING catalogue row: only columns that are
 * stored empty (null, blank, []) and arrive non-empty. Stored values are never
 * overwritten, so no user can rename or re-cover a title for everyone.
 */
export function fillOnlyUpdate(
  existing: Record<string, unknown>,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(upsertUpdatePayload(fields))) {
    if (SERVER_OWNED.has(key)) continue;
    if (!(key in existing)) continue; // unknown column: never sent to Prisma
    if (isEmpty(existing[key])) out[key] = value;
  }
  return out;
}
