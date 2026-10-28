import { describe, expect, it } from 'vitest';

import { buildIcs, escapeText, foldLine, icsDate, icsTimestamp } from '@/lib/ics';

/** One backslash (kept out of string literals for readability). */
const BS = String.fromCharCode(92);
const octets = (s: string) => new TextEncoder().encode(s).length;

describe('escapeText', () => {
  it('escapes backslash, semicolon, comma and newlines (RFC 5545 3.3.11)', () => {
    expect(escapeText('a\\b;c,d\ne\r\nf')).toBe('a' + BS + BS + 'b' + BS + ';c' + BS + ',d' + BS + 'ne' + BS + 'nf');
  });
});

describe('foldLine', () => {
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:Dune')).toBe('SUMMARY:Dune');
  });
  it('folds at 75 octets with CRLF + space, and unfolds to the original', () => {
    const line = `SUMMARY:${'x'.repeat(200)}`;
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts) expect(octets(p)).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
  it('never splits a multi-byte UTF-8 character', () => {
    const line = `SUMMARY:${'葬送のフリーレン 🎬 Ünïcødé '.repeat(8)}`;
    const folded = foldLine(line);
    for (const p of folded.split('\r\n')) {
      expect(octets(p)).toBeLessThanOrEqual(75);
      // Each part decodes cleanly on its own (no broken sequences).
      expect(new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(p))).toBe(p);
      expect(p).not.toMatch(/[\uD800-\uDBFF]$/); // no lone high surrogate at a fold
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});

describe('buildIcs', () => {
  const now = new Date('2026-10-28T06:00:00Z');
  const ics = buildIcs({
    name: 'Hoard',
    now,
    events: [
      { uid: 'release-a1@hoard', date: '2026-11-18', summary: 'Dune; Part Three, the end', description: 'Movie · out', url: 'https://hoard.example/movies?open=a1' },
      { uid: 'bad@hoard', date: '2026-02-30', summary: 'skipped' },
    ],
  });

  it('is a VCALENDAR with CRLF line endings throughout', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Hoard//Calendar//EN\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(ics).toContain('X-WR-CALNAME:Hoard\r\n');
  });
  it('writes all-day events with a stable UID, DTSTAMP and an exclusive DTEND', () => {
    expect(ics).toContain('UID:release-a1@hoard\r\n');
    expect(ics).toContain('DTSTAMP:20261028T060000Z\r\n');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261118\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20261119\r\n');
    expect(ics).toContain('SUMMARY:Dune' + BS + '; Part Three' + BS + ', the end\r\n');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1); // the impossible date is skipped
  });
  it('month and year ends roll over in DTEND', () => {
    const out = buildIcs({ name: 'H', now, events: [{ uid: 'x', date: '2026-12-31', summary: 'NYE' }] });
    expect(out).toContain('DTEND;VALUE=DATE:20270101');
  });
  it('helpers', () => {
    expect(icsDate('2026-01-05')).toBe('20260105');
    expect(icsTimestamp(new Date('2026-03-01T12:34:56.789Z'))).toBe('20260301T123456Z');
  });
});
