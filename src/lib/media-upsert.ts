// The `update` half of a media-row upsert (addToList). A search hit is often
// thinner than the stored row (no book description, runtime / episode counts
// null when enrichment failed, no genres), so re-adding or re-searching a
// title must never overwrite stored data with nothing: null, undefined, empty
// strings and empty arrays are dropped. The `create` half stays complete.
// Clearing a value (e.g. a show's next air date) is the metadata job's job.

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
