// ───────────────────────────────────────────────────────────────────────────
//  Ownership and format (spec 3.5). Games record the platforms they are owned
//  on (IGDB's platform names or free text); books and manga a format (print,
//  ebook, audio), music another (vinyl, CD, digital). Pure and client-safe.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from './categories';

export const BOOK_FORMATS = ['print', 'ebook', 'audio'] as const;
export const MUSIC_FORMATS = ['vinyl', 'cd', 'digital'] as const;

const FORMAT_LABEL: Record<string, string> = {
  print: 'Print',
  ebook: 'Ebook',
  audio: 'Audiobook',
  vinyl: 'Vinyl',
  cd: 'CD',
  digital: 'Digital',
};

/** The format choices for a section; empty when it has none. */
export function formatOptions(slug: CategorySlug): readonly string[] {
  if (slug === 'books' || slug === 'manga') return BOOK_FORMATS;
  if (slug === 'music') return MUSIC_FORMATS;
  return [];
}

export function formatLabel(format: string): string {
  return FORMAT_LABEL[format] ?? format;
}

/** True for a format allowed in this section (null clears it). */
export function validFormat(slug: CategorySlug, format: unknown): format is string | null {
  return format === null || (typeof format === 'string' && formatOptions(slug).includes(format));
}

export const MAX_PLATFORMS = 20;
export const MAX_PLATFORM_LENGTH = 60;

/**
 * Owned platforms as stored: trimmed, inner spaces collapsed, empty and
 * over-long names dropped, de-duplicated ignoring case (first spelling wins),
 * at most MAX_PLATFORMS.
 */
export function cleanPlatforms(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of input) {
    if (typeof v !== 'string') continue;
    const name = v.trim().replace(/\s+/g, ' ');
    if (!name || name.length > MAX_PLATFORM_LENGTH) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_PLATFORMS) break;
  }
  return out;
}

/** What the list view shows: "PC, Switch" or "Vinyl"; null when nothing is set. */
export function ownershipText(a: { category: CategorySlug; ownedPlatforms: string[]; format: string | null }): string | null {
  if (a.category === 'games') return a.ownedPlatforms.length ? a.ownedPlatforms.join(', ') : null;
  return a.format ? formatLabel(a.format) : null;
}

/** Filter values: every platform owned in this list (A–Z), or the section's formats. */
export function ownershipChoices(
  slug: CategorySlug,
  activities: { ownedPlatforms: string[] }[],
): { value: string; label: string }[] {
  if (slug === 'games') {
    const names = new Map<string, string>();
    for (const a of activities) for (const p of a.ownedPlatforms) if (!names.has(p.toLowerCase())) names.set(p.toLowerCase(), p);
    return [...names.values()].sort((a, b) => a.localeCompare(b)).map((p) => ({ value: p, label: p }));
  }
  return formatOptions(slug).map((f) => ({ value: f, label: formatLabel(f) }));
}

/** Does an activity pass the ownership filter ('ALL', 'NONE' = nothing set, or a value)? */
export function matchesOwnership(
  a: { category: CategorySlug; ownedPlatforms: string[]; format: string | null },
  filter: string,
): boolean {
  if (filter === 'ALL') return true;
  if (a.category === 'games') {
    if (filter === 'NONE') return a.ownedPlatforms.length === 0;
    return a.ownedPlatforms.some((p) => p.toLowerCase() === filter.toLowerCase());
  }
  if (filter === 'NONE') return a.format == null;
  return a.format === filter;
}

/** Whether a section has ownership / format at all. */
export function hasOwnership(slug: CategorySlug): boolean {
  return slug === 'games' || formatOptions(slug).length > 0;
}
