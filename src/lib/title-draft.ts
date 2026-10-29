// ───────────────────────────────────────────────────────────────────────────
//  The values a title's Save writes (status, score, favourite, notes,
//  franchise) and the rules for unsaved edits. Pure: the editor hook
//  (src/components/title/use-title-editor.ts) keeps two copies, `local`
//  (what the fields show) and `base` (what the server is known to hold).
//  - dirty: the fields that differ between the two;
//  - a newer server value (another tab, Watch again, "Mark as Listened")
//    flows into every field the user hasn't edited, never over an edit;
//  - a draft (unsaved edits kept when leaving the title page) stores both
//    copies, so coming back re-applies only the fields that were edited and
//    that the server hasn't changed since; anything malformed is ignored;
//  - a popup save drops from a stored draft only the fields it wrote
//    (pruneDraft), and the popup's "Open full page" merges its edits into
//    one field by field (mergeDraft).
// ───────────────────────────────────────────────────────────────────────────

import { STATUSES, type Status } from '@/lib/status';
import type { ActivityWithMedia } from '@/lib/types';

/** The franchise picker's "no franchise" and "new franchise from this title" values. */
export const NO_FRANCHISE = '__none';
export const NEW_FRANCHISE = '__new';

export interface TitleValues {
  status: Status;
  rating: number | null;
  favorite: boolean;
  notes: string;
  /** A franchise id, NO_FRANCHISE or NEW_FRANCHISE. */
  franchiseId: string;
}

export const TITLE_VALUE_KEYS = ['status', 'rating', 'favorite', 'notes', 'franchiseId'] as const satisfies readonly (keyof TitleValues)[];

/** Placeholder values for a closed popup (no title). */
export const EMPTY_VALUES: TitleValues = { status: 'PLANNED', rating: null, favorite: false, notes: '', franchiseId: NO_FRANCHISE };

/** A title's saved values, as the fields show them (null notes as ''). */
export function valuesOf(a: Pick<ActivityWithMedia, 'status' | 'rating' | 'favorite' | 'notes' | 'franchise'>): TitleValues {
  return {
    status: a.status,
    rating: a.rating,
    favorite: a.favorite,
    notes: a.notes ?? '',
    franchiseId: a.franchise?.id ?? NO_FRANCHISE,
  };
}

/** The fields whose values differ (in TITLE_VALUE_KEYS order). */
export function changedFields(local: TitleValues, base: TitleValues): (keyof TitleValues)[] {
  return TITLE_VALUE_KEYS.filter((k) => local[k] !== base[k]);
}

export function isDirty(local: TitleValues, base: TitleValues): boolean {
  return changedFields(local, base).length > 0;
}

/**
 * The server now holds `server`: a field the user hasn't edited (local equals
 * base) takes the server's value; an edited one keeps the edit, now measured
 * against the server's value.
 */
export function followServer(
  local: TitleValues,
  base: TitleValues,
  server: TitleValues,
): { local: TitleValues; base: TitleValues } {
  const next = { ...local };
  for (const k of TITLE_VALUE_KEYS) {
    if (local[k] === base[k]) (next as Record<string, unknown>)[k] = server[k];
  }
  return { local: next, base: { ...server } };
}

/** A stable signature of the values (for "did the server's values change?"). */
export function valuesKey(v: TitleValues): string {
  return JSON.stringify(TITLE_VALUE_KEYS.map((k) => v[k]));
}

/** Unsaved edits kept for later: the fields as shown, and the values they were edits of. */
export interface TitleDraft {
  local: TitleValues;
  base: TitleValues;
}

/** Stored values back into values, or null when they aren't complete and valid. */
export function parseValues(raw: unknown): TitleValues | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.status !== 'string' || !(STATUSES as readonly string[]).includes(d.status)) return null;
  if (d.rating !== null && (typeof d.rating !== 'number' || !Number.isFinite(d.rating))) return null;
  if (typeof d.favorite !== 'boolean') return null;
  if (typeof d.notes !== 'string') return null;
  if (typeof d.franchiseId !== 'string' || d.franchiseId.length === 0) return null;
  return {
    status: d.status as Status,
    rating: d.rating as number | null,
    favorite: d.favorite,
    notes: d.notes,
    franchiseId: d.franchiseId,
  };
}

/** A stored draft (an object or its JSON), or null when it isn't a valid one. */
export function parseDraft(raw: unknown): TitleDraft | null {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  const local = parseValues((v as Record<string, unknown>).local);
  const base = parseValues((v as Record<string, unknown>).base);
  return local && base ? { local, base } : null;
}

/**
 * The fields to show for a draft: the server's values, with the draft's edits
 * on top — but only where the server still holds what the edit was made
 * against. A field saved since (from the popup, another tab) has moved on,
 * so its stale edit is dropped rather than shown as unsaved, where a later
 * Save would overwrite the newer value. (Every field is a primitive.)
 */
export function applyDraft(server: TitleValues, draft: TitleDraft): TitleValues {
  const out = { ...server };
  for (const k of changedFields(draft.local, draft.base)) {
    if (server[k] === draft.base[k]) (out as Record<string, unknown>)[k] = draft.local[k];
  }
  return out;
}

/**
 * A stored draft once `written` (the fields a save just wrote) are no longer
 * edits in it: the other edits stay. Null when no edits remain (the draft can
 * go).
 */
export function pruneDraft(draft: TitleDraft, written: readonly (keyof TitleValues)[]): TitleDraft | null {
  const local = { ...draft.local };
  for (const k of written) (local as Record<string, unknown>)[k] = draft.base[k];
  return isDirty(local, draft.base) ? { local, base: { ...draft.base } } : null;
}

/**
 * `incoming`'s edits laid over a stored draft, field by field: an edited
 * field takes the incoming edit (and the value it was made against); a field
 * only the stored draft edited keeps that edit; the rest follow `incoming`.
 */
export function mergeDraft(stored: TitleDraft | null, incoming: TitleDraft): TitleDraft {
  if (!stored) return { local: { ...incoming.local }, base: { ...incoming.base } };
  const local = { ...incoming.local };
  const base = { ...incoming.base };
  for (const k of TITLE_VALUE_KEYS) {
    if (incoming.local[k] !== incoming.base[k] || stored.local[k] === stored.base[k]) continue;
    (local as Record<string, unknown>)[k] = stored.local[k];
    (base as Record<string, unknown>)[k] = stored.base[k];
  }
  return { local, base };
}
