// ───────────────────────────────────────────────────────────────────────────
//  Title normalisation for franchise matching. Pure and dependency-free so it
//  can be unit-tested and used from client code.
// ───────────────────────────────────────────────────────────────────────────

/** Names this short are too generic to auto-match on ("it", "up", "her"). */
export const MIN_MATCH_LENGTH = 4;

/**
 * Reduce a title to its franchise core: lowercase, accents stripped, subtitle
 * after ":" / "–" / " - " dropped, and sequel/season/movie markers removed.
 *
 *   "Chainsaw Man – The Movie: Reze Arc" → "chainsaw man"
 *   "Dune: Part Two"                     → "dune"
 *   "JUJUTSU KAISEN Season 2"            → "jujutsu kaisen"
 */
export function normalizeTitle(title: string): string {
  // NFKD splits accented letters; then drop the combining marks (U+0300–U+036F).
  let s = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Keep only the part before a subtitle separator.
  s = s.split(/\s*[:–—]\s*|\s+-\s+/)[0] ?? s;
  s = s.replace(/\(.*?\)|\[.*?\]/g, ' ');
  s = s.replace(
    /\b(the movie|movie|film|the final season|final season|season \d+|\d+(st|nd|rd|th) season|part \d+|ova|ona|specials?|collection)\b/g,
    ' ',
  );
  s = s.replace(/[^a-z0-9 ]+/g, ' ');
  // Trailing sequel numbers: "dune 2", "toy story iii".
  s = s.replace(/\s+(ii|iii|iv|v|vi|vii|viii|ix|x|\d{1,2})\s*$/, ' ');
  s = s.replace(/^the\s+/, '');
  return s.replace(/\s+/g, ' ').trim();
}

/** True when a normalised name is specific enough to group titles by. */
export function isMatchable(name: string): boolean {
  return name.length >= MIN_MATCH_LENGTH;
}
