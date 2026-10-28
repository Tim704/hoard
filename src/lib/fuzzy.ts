// ───────────────────────────────────────────────────────────────────────────
//  Fuzzy matching for the Cmd/Ctrl+K palette (spec 2.6). Pure and
//  client-safe. Matches rank in tiers: exact, whole-title prefix, every
//  query word starting a title word, a word-start substring, any substring,
//  and finally the query's letters in order (a subsequence, rewarded for
//  landing on word starts). Shorter titles win ties.
// ───────────────────────────────────────────────────────────────────────────

/** Lower-case, accents stripped, punctuation as spaces, single-spaced. */
export function foldText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Word start positions of a folded text. */
function wordStarts(t: string): Set<number> {
  const starts = new Set<number>([0]);
  for (let i = 1; i < t.length; i++) if (t[i - 1] === ' ' && t[i] !== ' ') starts.add(i);
  return starts;
}

/**
 * How well `query` matches `text` (higher is better), or null for no match.
 * Both are folded first; an empty query matches nothing.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = foldText(query);
  const t = foldText(text);
  if (!q || !t) return null;
  const lengthPenalty = Math.min(t.length, 99) / 100; // < 1, only breaks ties

  if (t === q) return 1000;
  if (t.startsWith(q)) return 900 - lengthPenalty;

  const words = t.split(' ');
  const qWords = q.split(' ');
  if (qWords.every((w) => words.some((tw) => tw.startsWith(w)))) return 800 - lengthPenalty;

  const starts = wordStarts(t);
  let at = t.indexOf(q);
  if (at >= 0) {
    let best = 500;
    for (; at >= 0; at = t.indexOf(q, at + 1)) {
      if (starts.has(at)) {
        best = 700;
        break;
      }
    }
    return best - lengthPenalty;
  }

  // Subsequence: every query letter in order, spaces ignored.
  const letters = q.replace(/ /g, '');
  let pos = 0;
  let onStarts = 0;
  let gaps = 0;
  let last = -1;
  for (const ch of letters) {
    const found = t.indexOf(ch, pos);
    if (found < 0) return null;
    if (starts.has(found)) onStarts++;
    if (last >= 0 && found > last + 1) gaps++;
    last = found;
    pos = found + 1;
  }
  return Math.max(1, 300 + onStarts * 20 - gaps * 10) - lengthPenalty;
}

/**
 * The items matching `query`, best first: each item's score is the best
 * over its texts (e.g. every title variant). Stable for equal scores.
 */
export function rankFuzzy<T>(items: T[], query: string, texts: (item: T) => string[], limit = 50): T[] {
  const scored: Array<{ item: T; score: number; i: number }> = [];
  items.forEach((item, i) => {
    let best: number | null = null;
    for (const text of texts(item)) {
      const s = fuzzyScore(query, text);
      if (s !== null && (best === null || s > best)) best = s;
    }
    if (best !== null) scored.push({ item, score: best, i });
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, limit).map((s) => s.item);
}
