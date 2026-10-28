// ───────────────────────────────────────────────────────────────────────────
//  MyAnimeList import (spec 2.7): the `animelist` / `mangalist` XML export
//  (myanimelist.net → Profile → Export, a `.xml.gz`), read in the browser.
//  Rows carry the MAL id, which is Hoard's anime / manga externalId, so they
//  match directly (src/lib/import/matcher.ts).
//
//  The export is flat and machine-written: <myanimelist> holds one <myinfo>
//  and one <anime> / <manga> element per entry, each with plain child
//  elements (CDATA for text). `readXmlRecords` is a tiny scanner for exactly
//  that shape, so the same code runs in the browser and in the tests (no
//  DOMParser in Vitest's node environment, and no new dependency).
//
//  Status: Watching / Reading → Ongoing, Completed → Completed, On-Hold →
//  Paused, Dropped → Dropped, Plan to Watch / Plan to Read → Planned (older
//  exports write the numbers 1–4 and 6). my_score is already 0–10, and 0
//  means unrated. 0000-00-00 dates are "none".
// ───────────────────────────────────────────────────────────────────────────

import { gunzipSync, strFromU8 } from 'fflate';

import type { Status } from '@/lib/status';

import { parseCount, parseDay, parseRating, splitList, text } from '../fields';
import { dedupeRows, type ParseResult } from '../rows';
import type { ImportRow } from '../types';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decode the five XML entities and numeric character references. */
export function decodeXmlText(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const amp = s.indexOf('&', i);
    if (amp < 0) return out + s.slice(i);
    out += s.slice(i, amp);
    const semi = s.indexOf(';', amp);
    const name = semi > amp ? s.slice(amp + 1, semi) : '';
    let ch: string | undefined;
    if (name.startsWith('#x') || name.startsWith('#X')) ch = codePoint(parseInt(name.slice(2), 16));
    else if (name.startsWith('#')) ch = codePoint(parseInt(name.slice(1), 10));
    else ch = ENTITIES[name];
    if (ch === undefined) {
      out += '&';
      i = amp + 1;
    } else {
      out += ch;
      i = semi + 1;
    }
  }
  return out;
}

function codePoint(n: number): string | undefined {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : undefined;
}

/** An element's inner text: CDATA sections verbatim, everything else entity-decoded. */
function innerText(raw: string): string {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const start = raw.indexOf('<![CDATA[', i);
    if (start < 0) return out + decodeXmlText(raw.slice(i));
    out += decodeXmlText(raw.slice(i, start));
    const end = raw.indexOf(']]>', start + 9);
    if (end < 0) return out + raw.slice(start + 9);
    out += raw.slice(start + 9, end);
    i = end + 3;
  }
  return out;
}

/** Skip whitespace from `i`. */
function skipSpace(s: string, i: number): number {
  while (i < s.length && (s[i] === ' ' || s[i] === '\n' || s[i] === '\r' || s[i] === '\t')) i++;
  return i;
}

/**
 * Every `<tag>` element in `xml` as a record of its child elements' text.
 * Only one level deep (all the MAL export needs); unknown markup inside a
 * child is kept as its text. Comments and the XML declaration are ignored
 * because only `<tag>` openings are looked for.
 */
export function readXmlRecords(xml: string, tag: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  let at = 0;
  for (;;) {
    const start = xml.indexOf(open, at);
    if (start < 0) break;
    const end = xml.indexOf(close, start + open.length);
    if (end < 0) break;
    records.push(readChildren(xml.slice(start + open.length, end)));
    at = end + close.length;
  }
  return records;
}

function readChildren(body: string): Record<string, string> {
  const rec: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    i = skipSpace(body, i);
    if (body[i] !== '<') {
      const next = body.indexOf('<', i);
      if (next < 0) break;
      i = next;
      continue;
    }
    if (body.startsWith('<!--', i)) {
      const endComment = body.indexOf('-->', i + 4);
      if (endComment < 0) break;
      i = endComment + 3;
      continue;
    }
    // A child's name runs to whitespace, '/' or '>'.
    let j = i + 1;
    while (j < body.length && !' \n\r\t/>'.includes(body[j])) j++;
    const name = body.slice(i + 1, j);
    const gt = body.indexOf('>', j);
    if (!name || name.startsWith('/') || gt < 0) {
      i = gt < 0 ? body.length : gt + 1;
      continue;
    }
    if (body[gt - 1] === '/') {
      rec[name] = '';
      i = gt + 1;
      continue;
    }
    const closing = `</${name}>`;
    const endChild = body.indexOf(closing, gt + 1);
    if (endChild < 0) break;
    rec[name] = innerText(body.slice(gt + 1, endChild));
    i = endChild + closing.length;
  }
  return rec;
}

export const MAL_STATUS: Record<string, Status> = {
  watching: 'CONSUMING',
  reading: 'CONSUMING',
  completed: 'COMPLETED',
  'on-hold': 'ON_HOLD',
  'on hold': 'ON_HOLD',
  dropped: 'DROPPED',
  'plan to watch': 'PLANNED',
  'plan to read': 'PLANNED',
  // Older exports write MAL's numeric codes.
  '1': 'CONSUMING',
  '2': 'COMPLETED',
  '3': 'ON_HOLD',
  '4': 'DROPPED',
  '6': 'PLANNED',
};

/** A MAL date cell ("2021-04-03"; "0000-00-00" or a partial "2021-00-00" = none). */
export function malDay(cell: string | undefined): string | undefined {
  return parseDay(cell);
}

/** One <anime> or <manga> record → an ImportRow (null without an id, title or known status). */
export function mapMalRecord(rec: Record<string, string>, kind: 'anime' | 'manga'): ImportRow | null {
  const id = (kind === 'anime' ? rec.series_animedb_id : rec.manga_mangadb_id)?.trim();
  const title = text(kind === 'anime' ? rec.series_title : rec.manga_title);
  const status = MAL_STATUS[(rec.my_status ?? '').trim().toLowerCase()];
  if (!id || !/^\d+$/.test(id) || id === '0' || !title || !status) return null;

  const row: ImportRow = { source: 'mal', category: kind, title, ids: { mal: id }, status };
  const rating = parseRating(rec.my_score, 10);
  if (rating !== undefined) row.rating = rating;
  const progress = parseCount(kind === 'anime' ? rec.my_watched_episodes : rec.my_read_chapters);
  if (progress) row.progress = progress;
  const startedOn = malDay(rec.my_start_date);
  if (startedOn) row.startedOn = startedOn;
  const finishedOn = malDay(rec.my_finish_date);
  if (finishedOn) row.finishedOn = finishedOn;
  const times = parseCount(kind === 'anime' ? rec.my_times_watched : rec.my_times_read);
  if (times) row.rewatchCount = times;
  const tags = splitList(rec.my_tags, /,/);
  if (tags.length) row.tags = tags;
  const notes = text(rec.my_comments);
  if (notes) row.notes = notes;
  return row;
}

/** The text of an export file: gunzipped when it is a .gz (by its magic bytes). */
export function malExportText(bytes: Uint8Array): string {
  const gz = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  return strFromU8(gz ? gunzipSync(bytes) : bytes);
}

/** A MAL export (anime or manga list, or both) → rows. */
export function parseMalXml(xml: string): ParseResult {
  if (!xml.includes('<myanimelist')) {
    return { rows: [], skipped: 0, warnings: ['This is not a MyAnimeList export (animelist / mangalist .xml).'] };
  }
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const kind of ['anime', 'manga'] as const) {
    for (const rec of readXmlRecords(xml, kind)) {
      const row = mapMalRecord(rec, kind);
      if (row) rows.push(row);
      else skipped++;
    }
  }
  return { rows: dedupeRows(rows), skipped, warnings: [] };
}
