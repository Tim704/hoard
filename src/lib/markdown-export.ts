// ───────────────────────────────────────────────────────────────────────────
//  Markdown export (spec 8.4): one `.md` note per title, for Obsidian and
//  friends, zipped as `<Section>/<Title (Year)>.md`. Pure — the loader is
//  `getMarkdownEntries` in src/lib/data-export.ts and the route is
//  /api/export/markdown.zip.
//
//  Each note opens with YAML front matter (every string double-quoted and
//  escaped, so a title like `Re: "Zero"` or one starting with `-` stays a
//  string) and continues with the notes, then the reviews from the diary,
//  newest first. `aliases` carries the bare title (and its other languages),
//  so an Obsidian `[[Title]]` link finds the note although its file name
//  also has the year — the same `[[Title]]` links Hoard resolves (8.5).
//
//  File names: characters that some file system rejects (/ \ : * ? " < > |
//  and control characters) are dropped, whitespace collapsed, leading dots
//  and trailing dots / spaces trimmed, Windows device names (CON, NUL, …)
//  suffixed, Unicode in NFC (so "é" typed two ways is one name), and the
//  result kept to 120 characters and 240 UTF-8 bytes with the year intact.
//  Two titles that land on the same name in a folder (compared without case,
//  as macOS and Windows do) become "Name (2)", "Name (3)", …
// ───────────────────────────────────────────────────────────────────────────

import { strToU8, zipSync } from 'fflate';

import { CATEGORIES, NAV_ORDER, type CategorySlug } from './categories';
import { isManualId } from './manual';
import { statusLabel, type Status } from './status';

export interface MarkdownReview {
  date: string;
  rating: number | null;
  rewatch: boolean;
  review: string | null;
}

export interface MarkdownEntry {
  category: CategorySlug;
  /** The title in the user's preferred language. */
  title: string;
  /** Other titles of the same work (stored title, other languages). */
  aliases: string[];
  year: number | null;
  status: Status;
  rating: number | null;
  /** Only when the title is placed on its tier list. */
  tier: string | null;
  started: string | null;
  finished: string | null;
  timesFinished: number;
  tags: string[];
  franchise: string | null;
  favourite: boolean;
  platforms: string[];
  format: string | null;
  link: string | null;
  notes: string | null;
  reviews: MarkdownReview[];
}

export const MAX_FILENAME = 120;
/** Most file systems cap a name at 255 bytes; leave room for ".md" and some slack. */
export const MAX_FILENAME_BYTES = 240;

const FORBIDDEN = /[/\\:*?"<>|\u0000-\u001f\u007f-\u009f]/g;
const DEVICE_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/** Keep at most `max` characters (whole code points, never half a surrogate pair). */
function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join('');
}

const utf8Length = (text: string) => new TextEncoder().encode(text).length;

/** Keep at most `max` UTF-8 bytes (whole code points). */
function clipBytes(text: string, max: number): string {
  let out = '';
  let used = 0;
  for (const ch of text) {
    const n = utf8Length(ch);
    if (used + n > max) break;
    out += ch;
    used += n;
  }
  return out;
}

function cleanPart(text: string): string {
  return text
    .normalize('NFC')
    .replace(FORBIDDEN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .trim();
}

function trimEnd(text: string): string {
  return text.replace(/[. ]+$/, '');
}

/**
 * A safe file or folder name (no extension) from free text, at most `max`
 * characters; `suffix` (e.g. " (1999)") is kept whole when there's room.
 */
export function sanitizeFilename(name: string, suffix = '', max = MAX_FILENAME): string {
  const end = cleanPart(suffix) ? ` ${cleanPart(suffix)}` : '';
  const room = Math.max(1, max - Array.from(end).length);
  const roomBytes = Math.max(4, MAX_FILENAME_BYTES - utf8Length(end));
  let base = trimEnd(clipBytes(clip(cleanPart(name), room), roomBytes));
  if (!base) base = 'Untitled';
  let out = trimEnd(base + end);
  if (DEVICE_NAMES.test(out)) out = `${out}_`;
  return out;
}

/** A YAML double-quoted scalar (safe for any text). */
export function yamlString(text: string): string {
  let out = '"';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (code === 0x85) out += '\\N';
    else if (code === 0x2028) out += '\\L';
    else if (code === 0x2029) out += '\\P';
    else if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0xfeff) {
      out += code < 0x100 ? `\\x${code.toString(16).padStart(2, '0')}` : `\\u${code.toString(16).padStart(4, '0')}`;
    } else out += ch;
  }
  return out + '"';
}

type YamlValue = string | number | boolean | null | string[];

function yamlLine(key: string, value: YamlValue): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return `${key}: []`;
    return `${key}:\n${value.map((v) => `  - ${yamlString(v)}`).join('\n')}`;
  }
  if (value === null) return `${key}: null`;
  if (typeof value === 'number' || typeof value === 'boolean') return `${key}: ${value}`;
  return `${key}: ${yamlString(value)}`;
}

/** Obsidian tags can't hold spaces: "comfort reread" → "comfort-reread". */
export function obsidianTag(tag: string): string {
  return tag.trim().replace(/\s+/g, '-').replace(/^#+/, '');
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** The title's page at its provider, when its id says where that is. */
export function providerUrl(slug: CategorySlug, media: Record<string, unknown>): string | null {
  const id = typeof media.externalId === 'string' ? media.externalId : '';
  if (!id || isManualId(id)) return null;
  switch (slug) {
    case 'movies':
      return /^\d+$/.test(id) ? `https://www.themoviedb.org/movie/${id}` : null;
    case 'tv':
      return /^\d+$/.test(id) ? `https://www.themoviedb.org/tv/${id}` : null;
    case 'anime':
    case 'manga': {
      const kind = slug === 'anime' ? 'anime' : 'manga';
      if (/^\d+$/.test(id)) return `https://myanimelist.net/${kind}/${id}`;
      const al = /^al-(\d+)$/.exec(id);
      return al ? `https://anilist.co/${kind}/${al[1]}` : null;
    }
    case 'books':
      return /^\/(works|books)\/OL\d+[WM]$/.test(id) ? `https://openlibrary.org${id}` : null;
    case 'games': {
      const steam = media.steamAppId;
      return typeof steam === 'number' && steam > 0 ? `https://store.steampowered.com/app/${steam}` : null;
    }
    case 'music': {
      const artist = typeof media.artist === 'string' ? media.artist.trim() : '';
      const title = typeof media.title === 'string' ? media.title.trim() : '';
      if (!artist || !title || id.startsWith('demo-')) return null;
      const part = (s: string) => encodeURIComponent(s).replace(/%20/g, '+');
      return `https://www.last.fm/music/${part(artist)}/${part(title)}`;
    }
  }
}

/** The note for one title: front matter, notes, reviews. */
export function markdownNote(e: MarkdownEntry): string {
  const section = CATEGORIES[e.category];
  const aliases = [...new Set([e.title, ...e.aliases].map((a) => a.trim()).filter(Boolean))];
  const lines: string[] = [
    '---',
    yamlLine('title', e.title),
    yamlLine('aliases', aliases),
    yamlLine('section', section.label),
    yamlLine('year', e.year),
    yamlLine('status', statusLabel(e.status, e.category)),
    yamlLine('status_code', e.status),
    yamlLine('score', e.rating),
    yamlLine('tier', e.tier),
    `started: ${e.started && YMD.test(e.started) ? e.started : 'null'}`,
    `finished: ${e.finished && YMD.test(e.finished) ? e.finished : 'null'}`,
    yamlLine('times_finished', e.timesFinished),
    yamlLine('tags', [...new Set(e.tags.map(obsidianTag).filter(Boolean))]),
    yamlLine('franchise', e.franchise),
    yamlLine('favourite', e.favourite),
  ];
  if (e.category === 'games') lines.push(yamlLine('platforms', e.platforms));
  if (e.format) lines.push(yamlLine('format', e.format));
  lines.push(yamlLine('link', e.link), '---', '', `# ${e.title.replace(/\s+/g, ' ')}`, '');

  const notes = e.notes?.trim();
  if (notes) lines.push(notes.replace(/\r\n?/g, '\n'), '');

  const reviews = [...e.reviews].sort((a, b) => b.date.localeCompare(a.date));
  if (reviews.length) {
    lines.push('## Diary', '');
    for (const r of reviews) {
      const bits = [r.date];
      if (r.rating != null) bits.push(`${r.rating}/10`);
      if (r.rewatch) bits.push('again');
      lines.push(`### ${bits.join(' · ')}`, '');
      const text = r.review?.trim();
      if (text) lines.push(text.replace(/\r\n?/g, '\n'), '');
    }
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

export interface MarkdownFile {
  path: string;
  content: string;
}

/** Every note at its `Section/Title (Year).md` path, in navigation order. */
export function markdownFiles(entries: MarkdownEntry[]): MarkdownFile[] {
  const order = new Map(NAV_ORDER.map((s, i) => [s, i]));
  const sorted = [...entries].sort(
    (a, b) =>
      (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) ||
      a.title.localeCompare(b.title) ||
      (a.year ?? 0) - (b.year ?? 0),
  );
  const used = new Set<string>();
  const out: MarkdownFile[] = [];
  for (const e of sorted) {
    const folder = sanitizeFilename(CATEGORIES[e.category].label);
    const year = e.year != null ? `(${e.year})` : '';
    let name = sanitizeFilename(e.title, year);
    const key = (n: string) => `${folder}/${n}`.normalize('NFC').toLowerCase();
    for (let n = 2; used.has(key(name)); n++) {
      name = sanitizeFilename(e.title, `${year} (${n})`);
    }
    used.add(key(name));
    out.push({ path: `${folder}/${name}.md`, content: markdownNote(e) });
  }
  return out;
}

/** The zip of `files` (fflate; fixed timestamps so equal input gives equal bytes). */
export function markdownZip(files: MarkdownFile[], mtime = new Date('2000-01-01T00:00:00Z')): Uint8Array {
  const tree: Record<string, [Uint8Array, { mtime: Date }]> = {};
  for (const f of files) tree[f.path] = [strToU8(f.content), { mtime }];
  return zipSync(tree, { level: 6 });
}
