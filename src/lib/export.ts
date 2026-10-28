// ───────────────────────────────────────────────────────────────────────────
//  Data export (spec 1.11): the library and franchises as CSV, plus the shape
//  of the full JSON export. Pure — src/lib/data-export.ts loads the rows and
//  the /api/export/* route handlers serve the files.
//
//  CSV follows RFC 4180: fields containing a comma, quote, CR or LF are quoted
//  and inner quotes doubled; lines end with CRLF. A UTF-8 BOM goes first so
//  Excel reads accents and CJK titles correctly.
// ───────────────────────────────────────────────────────────────────────────

import { NAV_ORDER } from './categories';
import type { Prefs } from './prefs';
import { orderQueue } from './queue';
import { todayYmd } from './release';
import { buildTierBoard, TIERS } from './tiers';
import type { ActivityWithMedia } from './types';

export const BOM = '﻿';

type Cell = string | number | boolean | null | undefined;

/** One CSV field, quoted only when it has to be. */
export function csvField(value: Cell): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows → CSV text (BOM, CRLF line ends, trailing CRLF). */
export function toCsv(rows: Cell[][]): string {
  return BOM + rows.map((r) => r.map(csvField).join(',') + '\r\n').join('');
}

/**
 * Parse RFC 4180 CSV (quoted fields with "" escapes and embedded newlines; a
 * leading BOM is ignored; CRLF or LF line ends). The inverse of `toCsv`, and
 * the base for re-importing an export.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = text.startsWith(BOM) ? 1 : 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** An activity as exported: the UI shape plus the fields the UI doesn't carry. */
export type ExportActivity = ActivityWithMedia & {
  startedAt: string | null;
  finishedAt: string | null;
  /** Tags (4.2) once the column exists; empty until then. */
  tags?: string[];
};

export const LIBRARY_COLUMNS = [
  'section',
  'title',
  'year',
  'status',
  'score',
  'tier',
  'tier position',
  'queue position',
  'favourite',
  'progress',
  'tags',
  'started',
  'finished',
  'franchise',
  'notes',
  'externalId',
  'createdAt',
] as const;

/**
 * The library CSV: one row per activity, sections in navigation order, each
 * section in tier list order (S→F by position), then Up next in queue order,
 * then everything else by title. `tier position` is the 1-based place inside
 * its tier; `queue position` the 1-based place in Up next. Start and finish
 * are calendar days in `timeZone` (spec G10).
 */
export function toLibraryCsv(list: ExportActivity[], timeZone: string): string {
  const day = (iso: string | null) => (iso ? todayYmd(timeZone, new Date(iso)) : null);
  const rows: Cell[][] = [[...LIBRARY_COLUMNS]];

  for (const slug of NAV_ORDER) {
    const section = list.filter((a) => a.category === slug);
    if (section.length === 0) continue;

    const board = buildTierBoard(section);
    const tierPos = new Map<string, number>();
    for (const t of TIERS) board.tiers[t].forEach((a, i) => tierPos.set(a.id, i + 1));
    const queue = orderQueue(section);
    const queuePos = new Map(queue.map((a, i) => [a.id, i + 1]));

    // buildTierBoard is typed for the base shape; the rows are the same objects.
    const tiered = TIERS.flatMap((t) => board.tiers[t]);
    const seen = new Set([...tiered, ...queue].map((a) => a.id));
    const rest = section
      .filter((a) => !seen.has(a.id))
      .sort((a, b) => a.media.title.localeCompare(b.media.title));

    for (const a of [...tiered, ...queue, ...rest] as ExportActivity[]) {
      const placed = tierPos.get(a.id);
      rows.push([
        slug,
        a.media.title,
        a.media.year,
        a.status,
        a.rating,
        placed ? a.tier : null,
        placed ?? null,
        queuePos.get(a.id) ?? null,
        a.favorite ? 'yes' : '',
        a.progress,
        (a.tags ?? []).join('; '),
        day(a.startedAt),
        day(a.finishedAt),
        a.franchise?.name ?? null,
        a.notes,
        a.media.externalId,
        a.createdAt,
      ]);
    }
  }
  return toCsv(rows);
}

export interface ExportFranchise {
  name: string;
  rating: number | null;
  rankOrder: number | null;
  notes: string | null;
  members: { category: string; title: string; year: number | null; status: string; rating: number | null }[];
}

export const FRANCHISE_COLUMNS = ['franchise', 'rank', 'franchise score', 'titles', 'members', 'notes'] as const;

/**
 * The franchises CSV: one row per franchise, ranked ones first (as on the
 * Franchises page). `members` lists "Title (year) [section]" joined by "; ".
 */
export function toFranchisesCsv(list: ExportFranchise[]): string {
  const ranked = [...list].sort(
    (a, b) =>
      (a.rankOrder ?? Infinity) - (b.rankOrder ?? Infinity) || a.name.localeCompare(b.name),
  );
  let rank = 0;
  const rows: Cell[][] = [[...FRANCHISE_COLUMNS]];
  for (const f of ranked) {
    rows.push([
      f.name,
      f.rankOrder != null ? ++rank : null,
      f.rating,
      f.members.length,
      f.members
        .map((m) => `${m.title}${m.year != null ? ` (${m.year})` : ''} [${m.category}]`)
        .join('; '),
      f.notes,
    ]);
  }
  return toCsv(rows);
}

/**
 * Settings as they go into the JSON export: everything except secrets — the
 * push targets (an ntfy topic or Discord webhook URL is a write credential)
 * and the calendar feed token.
 */
export function exportablePrefs(prefs: Prefs) {
  const { calendarToken: _token, notify, ...rest } = prefs;
  return {
    ...rest,
    notify: {
      kinds: notify.kinds,
      ntfyConfigured: notify.ntfyUrl != null,
      discordConfigured: notify.discordWebhook != null,
    },
  };
}

/** "hoard-library-2026-10-28.csv" — dated in the user's time zone. */
export function exportFilename(name: string, ext: string, timeZone: string, now = new Date()): string {
  return `hoard-${name}-${todayYmd(timeZone, now)}.${ext}`;
}
