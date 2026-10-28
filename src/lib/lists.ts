// ───────────────────────────────────────────────────────────────────────────
//  Custom lists (spec 4.11): the access rules and input checks. Pure and
//  client-safe.
//
//  - The owner can do everything: edit items, rename, invite, remove
//    members, share publicly and delete.
//  - An editor member can add, remove and reorder items.
//  - A viewer member can only look. Any member can leave.
//  Members only ever see the list's items (catalogue titles and covers),
//  never anyone's library, scores or notes.
// ───────────────────────────────────────────────────────────────────────────

export const LIST_NAME_MAX = 80;
export const LIST_DESCRIPTION_MAX = 500;
/** Most items in one list, and most lists / members per owner-facing call. */
export const LIST_ITEMS_MAX = 1000;
export const LIST_MEMBERS_MAX = 50;

export interface ListAccessShape {
  ownerId: string;
  members: readonly { userId: string; canEdit: boolean }[];
}

export type ListRole = 'owner' | 'editor' | 'viewer';

/** The user's role on a list, or null when they have no access. */
export function listRole(list: ListAccessShape | null | undefined, userId: string | null | undefined): ListRole | null {
  if (!list || !userId) return null;
  if (list.ownerId === userId) return 'owner';
  const member = list.members.find((m) => m.userId === userId);
  if (!member) return null;
  return member.canEdit ? 'editor' : 'viewer';
}

export const canViewList = (list: ListAccessShape | null | undefined, userId: string | null | undefined): boolean =>
  listRole(list, userId) !== null;

export const canEditList = (list: ListAccessShape | null | undefined, userId: string | null | undefined): boolean => {
  const role = listRole(list, userId);
  return role === 'owner' || role === 'editor';
};

/** Rename, invite, remove members, share and delete: the owner only. */
export const canManageList = (list: ListAccessShape | null | undefined, userId: string | null | undefined): boolean =>
  listRole(list, userId) === 'owner';

export type ListInput = { ok: true; name: string; description: string | null } | { ok: false; error: string };

/** A list's name (1–80 characters) and optional description (≤ 500), trimmed. */
export function parseListInput(name: unknown, description: unknown): ListInput {
  if (typeof name !== 'string') return { ok: false, error: 'Give the list a name.' };
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) return { ok: false, error: 'Give the list a name.' };
  if (n.length > LIST_NAME_MAX) return { ok: false, error: `Keep the name under ${LIST_NAME_MAX + 1} characters.` };
  if (description != null && typeof description !== 'string') return { ok: false, error: 'Invalid description.' };
  const d = (description ?? '').trim();
  if (d.length > LIST_DESCRIPTION_MAX) {
    return { ok: false, error: `Keep the description under ${LIST_DESCRIPTION_MAX + 1} characters.` };
  }
  return { ok: true, name: n, description: d || null };
}

/** Gap between item positions. */
export const LIST_STEP = 1000;

/** Position for an item joining the end of a list. */
export const nextListPosition = (max: number | null | undefined): number => (max == null ? LIST_STEP : max + LIST_STEP);

/**
 * Whether `ordered` is exactly the list's item ids in some order (a
 * reorder may never add, drop or duplicate items).
 */
export function isPermutation(ordered: readonly unknown[], ids: readonly string[]): ordered is string[] {
  if (ordered.length !== ids.length) return false;
  const want = new Set(ids);
  const seen = new Set<string>();
  for (const x of ordered) {
    if (typeof x !== 'string' || !want.has(x) || seen.has(x)) return false;
    seen.add(x);
  }
  return true;
}
