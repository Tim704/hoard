// ───────────────────────────────────────────────────────────────────────────
//  RFC 4180 CSV reading for the importers (spec 2.1). Files are parsed in the
//  browser, so this is pure and dependency-free.
//
//  Handles what real exports throw at us: a UTF-8 BOM, quoted fields holding
//  commas, doubled quotes and line breaks, CRLF / LF / lone CR line ends, and
//  blank lines (anywhere, including trailing ones), which are dropped.
// ───────────────────────────────────────────────────────────────────────────

const BOM = '﻿';

/** Text → rows of fields. Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  // Whether the current line holds anything (so a quoted "" still counts).
  let touched = false;
  let i = text.startsWith(BOM) ? 1 : 0;

  const endRow = () => {
    row.push(field);
    if (touched || row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
    field = '';
    touched = false;
  };

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
      touched = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
      touched = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += c;
      touched = true;
    }
  }
  if (touched || field !== '' || row.length > 0) endRow();
  return rows;
}

/**
 * Text → one object per data row, keyed by the (trimmed) header names. Missing
 * trailing cells read as ''. Header names are matched case-sensitively, as
 * every source writes them consistently.
 */
export function csvRecords(text: string): { headers: string[]; records: Record<string, string>[] } {
  const [head, ...body] = parseCsv(text);
  if (!head) return { headers: [], records: [] };
  const headers = head.map((h) => h.trim());
  const records = body.map((cells) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = cells[i] ?? '';
    });
    return rec;
  });
  return { headers, records };
}

/** True when every name in `required` is a header (to recognise a file). */
export function hasHeaders(headers: string[], required: string[]): boolean {
  const set = new Set(headers);
  return required.every((h) => set.has(h));
}
