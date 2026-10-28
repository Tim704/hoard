// ───────────────────────────────────────────────────────────────────────────
//  ISBNs (spec 2.9): typed or scanned. Pure and client-safe.
// ───────────────────────────────────────────────────────────────────────────

function valid10(s: string): boolean {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i);
  return sum % 11 === 0;
}

function valid13(s: string): boolean {
  if (!/^97[89]\d{10}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
  return sum % 10 === 0;
}

/**
 * A typed or scanned ISBN-10/13 (spaces and hyphens allowed, lower-case x
 * accepted) as bare digits, or null when its check digit is wrong.
 */
export function normalizeIsbn(input: string): string | null {
  const s = input.replace(/[\s-]/g, '').toUpperCase();
  if (s.length === 10 && valid10(s)) return s;
  if (s.length === 13 && valid13(s)) return s;
  return null;
}

/** The ISBN-13 for a valid ISBN-10 (978 prefix, new check digit). */
export function isbn10to13(isbn10: string): string {
  const core = `978${isbn10.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  return core + String((10 - (sum % 10)) % 10);
}
