// ───────────────────────────────────────────────────────────────────────────
//  Linked notes (spec 8.5): `[[Title]]` in a title's notes or a diary review
//  points at another title in the same user's library. Pure and client-safe;
//  the details render the links (components/linked-text.tsx) and list
//  "Mentioned in" (src/lib/data-mentions.ts).
//
//  Syntax:
//  - `[[Title]]` links; `[[Title|shown text]]` links but shows its own text
//    (as in Obsidian). Single brackets inside are fine while they balance:
//    `[[Persona 5 [Royal]]]` targets "Persona 5 [Royal]".
//  - A link never spans lines, and its target is 1–200 characters.
//  - `\[[` is a literal `[[` (the backslash is dropped); an unclosed `[[`
//    stays text, and a `[[` inside an unclosed one starts its own link.
//
//  Resolution, against the library index (newest update first):
//  1. any title variant (stored, English, romaji, native) equal to the
//     target, ignoring case and spacing;
//  2. else the same with accents and punctuation ignored;
//  3. else, for "Title (1999)", the title with that year.
//  Among several matches the one in the linking title's section wins, then
//  the most recently updated. A title never links to itself.
// ───────────────────────────────────────────────────────────────────────────

import { foldText } from './fuzzy';
import { titleVariants, type TitledMedia } from './title';

export type NoteSegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; target: string; label: string };

export const MAX_LINK_TARGET = 200;

/** Split text into plain runs and `[[links]]`. */
export function parseNoteLinks(text: string): NoteSegment[] {
  const out: NoteSegment[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ kind: 'text', text: buf });
    buf = '';
  };
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\' && text.startsWith('[[', i + 1)) {
      buf += '[[';
      i += 3;
      continue;
    }
    if (!text.startsWith('[[', i)) {
      buf += text[i++];
      continue;
    }
    const close = findClose(text, i + 2);
    const inner = close === -1 ? '' : text.slice(i + 2, close);
    const bar = inner.indexOf('|');
    const target = (bar === -1 ? inner : inner.slice(0, bar)).replace(/\s+/g, ' ').trim();
    const label = bar === -1 ? target : inner.slice(bar + 1).replace(/\s+/g, ' ').trim() || target;
    if (close === -1 || !target || target.length > MAX_LINK_TARGET) {
      // Not a link: keep the brackets as text and look again after them.
      buf += '[[';
      i += 2;
      continue;
    }
    flush();
    out.push({ kind: 'link', target, label });
    i = close + 2;
  }
  flush();
  return out;
}

/** Index of the `]]` closing a link whose content starts at `from`, or -1. */
function findClose(text: string, from: number): number {
  let depth = 0;
  for (let j = from; j < text.length; j++) {
    const c = text[j];
    if (c === '\n' || c === '\r') return -1;
    if (c === '[') depth++;
    else if (c === ']') {
      if (depth > 0) depth--;
      else return text[j + 1] === ']' ? j : -1;
    }
  }
  return -1;
}

/** Every distinct link target in `text` (as written). */
export function linkTargets(text: string | null | undefined): string[] {
  if (!text || !text.includes('[[')) return [];
  const seen = new Map<string, string>();
  for (const s of parseNoteLinks(text)) if (s.kind === 'link' && !seen.has(titleKey(s.target))) seen.set(titleKey(s.target), s.target);
  return [...seen.values()];
}

/** Case- and spacing-insensitive comparison key of a title. */
export function titleKey(title: string): string {
  return title.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();
}

export interface LinkCandidate extends TitledMedia {
  id: string;
  category: string;
  year: number | null;
}

export interface LinkSource {
  id?: string | null;
  category?: string | null;
}

/**
 * The library title `target` points at, or null. `index` must be ordered
 * newest update first (as getLibraryIndex returns it).
 */
export function resolveNoteLink<T extends LinkCandidate>(target: string, index: readonly T[], from: LinkSource = {}): T | null {
  const pool = from.id ? index.filter((e) => e.id !== from.id) : index;
  const pick = (matches: T[]) => matches.find((e) => e.category === from.category) ?? matches[0] ?? null;

  const key = titleKey(target);
  if (!key) return null;
  const exact = pool.filter((e) => titleVariants(e).some((t) => titleKey(t) === key));
  if (exact.length) return pick(exact);

  const folded = foldText(target);
  if (folded) {
    const loose = pool.filter((e) => titleVariants(e).some((t) => foldText(t) === folded));
    if (loose.length) return pick(loose);
  }

  const withYear = /^(.*\S)\s*\((\d{4})\)$/.exec(target.trim());
  if (withYear) {
    const year = Number(withYear[2]);
    const byYear = resolveNoteLink(withYear[1], pool.filter((e) => e.year === year), from);
    if (byYear) return byYear;
  }
  return null;
}

/** The `[[` being typed at `caret`: where it starts and what's typed so far. */
export function linkQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const open = before.lastIndexOf('[[');
  if (open === -1 || (open > 0 && before[open - 1] === '\\')) return null;
  const typed = before.slice(open + 2);
  if (/[\n\r]|\]\]|\[\[/.test(typed) || typed.length > MAX_LINK_TARGET) return null;
  return { start: open, query: typed };
}

/**
 * Text after picking `title` for the `[[` at `start`: the typed part (and a
 * `]]` already right after the caret) becomes `[[title]]`; the caret lands
 * after it.
 */
export function completeLink(text: string, start: number, caret: number, title: string): { text: string; caret: number } {
  const after = text.slice(caret).startsWith(']]') ? text.slice(caret + 2) : text.slice(caret);
  const link = `[[${title.replace(/\]\]/g, '] ]').replace(/[\r\n]+/g, ' ')}]]`;
  return { text: text.slice(0, start) + link + after, caret: start + link.length };
}

export interface MentionSource {
  id: string;
  category: string;
  /** The notes and every diary review of that title. */
  texts: (string | null)[];
}

/** Ids of the `sources` whose notes or reviews link to `targetId`. */
export function mentionsOf<T extends LinkCandidate>(targetId: string, sources: readonly MentionSource[], index: readonly T[]): string[] {
  const out: string[] = [];
  for (const s of sources) {
    if (s.id === targetId) continue;
    const targets = new Set(s.texts.flatMap((t) => linkTargets(t)));
    for (const t of targets) {
      if (resolveNoteLink(t, index, s)?.id === targetId) {
        out.push(s.id);
        break;
      }
    }
  }
  return out;
}
