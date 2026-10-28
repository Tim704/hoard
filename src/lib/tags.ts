// ───────────────────────────────────────────────────────────────────────────
//  Tags (spec 4.2): free-form labels on a title. Pure and client-safe.
//
//  One normaliser for every way a tag comes in (the details' tag input, the
//  server action that stores them): trimmed, inner whitespace collapsed to one
//  space, at most 40 characters, at most 20 tags per title, and duplicates
//  dropped case-insensitively — the first spelling wins ("Sci-Fi" then
//  "sci-fi" keeps "Sci-Fi"). Filtering and counting also compare
//  case-insensitively, so "Comfort" and "comfort" are one tag everywhere.
// ───────────────────────────────────────────────────────────────────────────

export const MAX_TAG_LENGTH = 40;
export const MAX_TAGS = 20;

/** One tag cleaned up, or null when nothing is left. */
export function normalizeTag(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim();
  return t ? t : null;
}

/** The comparison key of a tag (case-insensitive). */
export const tagKey = (tag: string): string => tag.toLocaleLowerCase('en');

/** A cleaned list: normalised, deduplicated (first spelling kept), at most 20. */
export function normalizeTags(raw: readonly unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (typeof r !== 'string') continue;
    const t = normalizeTag(r);
    if (!t || seen.has(tagKey(t))) continue;
    seen.add(tagKey(t));
    out.push(t);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

/** `existing` plus what was typed (commas separate several tags). */
export function addTags(existing: readonly string[], typed: string): string[] {
  return normalizeTags([...existing, ...typed.split(',')]);
}

/** `existing` without `tag` (case-insensitive). */
export function removeTag(existing: readonly string[], tag: string): string[] {
  return existing.filter((t) => tagKey(t) !== tagKey(tag));
}

/** True when `tags` holds every one of `selected` (AND; case-insensitive). */
export function hasAllTags(tags: readonly string[], selected: readonly string[]): boolean {
  if (selected.length === 0) return true;
  const own = new Set(tags.map(tagKey));
  return selected.every((s) => own.has(tagKey(s)));
}

export interface TagCount<S extends string = string> {
  tag: string;
  count: number;
  /** Titles per section with this tag. */
  bySection: Partial<Record<S, number>>;
}

/**
 * Every tag with how many titles carry it, most used first (then A–Z). The
 * spelling shown is the first one met.
 */
export function countTags<S extends string>(
  items: readonly { tags: readonly string[]; section: S }[],
): TagCount<S>[] {
  const byKey = new Map<string, TagCount<S>>();
  for (const item of items) {
    const seenHere = new Set<string>();
    for (const tag of item.tags) {
      const k = tagKey(tag);
      if (seenHere.has(k)) continue;
      seenHere.add(k);
      const entry: TagCount<S> = byKey.get(k) ?? { tag, count: 0, bySection: {} };
      entry.count += 1;
      entry.bySection[item.section] = (entry.bySection[item.section] ?? 0) + 1;
      byKey.set(k, entry);
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Suggestions for the tag input: known tags matching `typed`, not already set. */
export function suggestTags(
  known: readonly string[],
  current: readonly string[],
  typed: string,
  limit = 8,
): string[] {
  const q = tagKey(typed.trim());
  const have = new Set(current.map(tagKey));
  return known
    .filter((t) => !have.has(tagKey(t)) && (!q || tagKey(t).includes(q)))
    .slice(0, limit);
}
