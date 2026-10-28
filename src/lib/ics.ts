// ───────────────────────────────────────────────────────────────────────────
//  A minimal RFC 5545 (iCalendar) writer for the private calendar feed (5.6).
//  Pure. Every event is an all-day VEVENT (DTSTART;VALUE=DATE, DTEND the next
//  day), with a stable UID, escaped TEXT values (\\ \; \, \n), lines folded
//  at 75 octets without splitting a UTF-8 character, and CRLF line endings.
// ───────────────────────────────────────────────────────────────────────────

import { isYmd } from '@/lib/release';

export interface IcsEvent {
  /** Unique and stable across refreshes, e.g. "release-abc123@hoard". */
  uid: string;
  /** YYYY-MM-DD. */
  date: string;
  summary: string;
  description?: string | null;
  url?: string | null;
}

export interface IcsCalendar {
  name: string;
  events: readonly IcsEvent[];
  /** DTSTAMP for every event (when the feed was generated). */
  now: Date;
}

const CRLF = '\r\n';
const MAX_OCTETS = 75;

/** Escape a TEXT value (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();
const octets = (s: string) => encoder.encode(s).length;

/**
 * Fold one content line (§3.1): no line longer than 75 octets, each
 * continuation starting with a single space, never inside a UTF-8 sequence.
 */
export function foldLine(line: string): string {
  if (octets(line) <= MAX_OCTETS) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  let limit = MAX_OCTETS;
  for (const ch of line) {
    const n = octets(ch);
    if (size + n > limit) {
      parts.push(current);
      current = '';
      size = 0;
      limit = MAX_OCTETS - 1; // the leading space counts
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/** "2026-11-18" → "20261118". */
export function icsDate(ymd: string): string {
  return ymd.replace(/-/g, '');
}

/** The day after a YYYY-MM-DD (DTEND of an all-day event is exclusive). */
function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** A UTC DATE-TIME: "20261028T060000Z". */
export function icsTimestamp(at: Date): string {
  return at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** The whole VCALENDAR, CRLF-terminated. Events with a malformed date are skipped. */
export function buildIcs(cal: IcsCalendar): string {
  const stamp = icsTimestamp(cal.now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hoard//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(cal.name)}`,
  ];
  for (const e of cal.events) {
    if (!isYmd(e.date)) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeText(e.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.date)}`,
      `DTEND;VALUE=DATE:${icsDate(nextDay(e.date))}`,
      `SUMMARY:${escapeText(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}
