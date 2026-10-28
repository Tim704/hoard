// ───────────────────────────────────────────────────────────────────────────
//  Genre normalising (spec F2). Pure and client-safe.
//
//  - Books: OpenLibrary "subjects" are a noisy free-for-all ("Fiction, science
//    fiction, general", "nyt:mass-market-monthly=2021-11-07", "Large type
//    books"). Only subjects that match the allow-list below become genres,
//    mapped to one canonical name, at most 3 per book in subject order.
//  - Music: Last.fm tags are user-made ("seen live", "albums i own"); junk tags
//    are dropped and the rest title-cased.
//  - Everything else (TMDB, AniList, IGDB) already has clean genre names and
//    only goes through `normalizeGenres` (trim + de-duplicate).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Canonical book genre → the subject phrases that mean it. A phrase matches
 * when it appears as whole words in the normalised subject; `exact` phrases
 * must be the whole subject (for words like "history" that otherwise match
 * "English literature, history and criticism"). Order matters: the first rule
 * that matches a subject wins, so specific rules come before broad ones.
 */
const BOOK_GENRE_RULES: Array<{ genre: string; contains?: string[]; exact?: string[] }> = [
  { genre: 'Science Fiction', contains: ['science fiction', 'sci fi', 'scifi', 'space opera', 'cyberpunk'] },
  { genre: 'Dystopia', contains: ['dystopia', 'dystopian', 'dystopias'] },
  { genre: 'Fantasy', contains: ['fantasy', 'fantasy fiction', 'magic', 'dragons', 'wizards'] },
  { genre: 'Horror', contains: ['horror', 'horror stories', 'horror tales', 'ghost stories', 'vampires'] },
  { genre: 'True Crime', contains: ['true crime'] },
  { genre: 'Mystery', contains: ['mystery', 'mysteries', 'detective and mystery stories', 'detective', 'whodunit'] },
  { genre: 'Thriller', contains: ['thriller', 'thrillers', 'suspense'] },
  { genre: 'Crime', contains: ['crime fiction', 'crime'] },
  { genre: 'Historical Fiction', contains: ['historical fiction', 'fiction historical'] },
  { genre: 'Romance', contains: ['romance', 'romance fiction', 'love stories'] },
  { genre: 'Young Adult', contains: ['young adult', 'young adult fiction'] },
  { genre: "Children's", contains: ['juvenile fiction', 'juvenile literature', 'childrens fiction', 'childrens stories', 'childrens literature', 'picture books'] },
  { genre: 'Graphic Novel', contains: ['graphic novels', 'graphic novel', 'comic books strips etc', 'comics'] },
  { genre: 'Adventure', contains: ['adventure', 'adventure stories', 'adventure fiction'] },
  { genre: 'Humor', contains: ['humor', 'humour', 'humorous fiction', 'humorous stories'] },
  { genre: 'Short Stories', contains: ['short stories'] },
  { genre: 'Poetry', contains: ['poetry', 'poems'] },
  { genre: 'Literary Fiction', contains: ['literary fiction'] },
  { genre: 'Classics', contains: ['classic literature', 'classics'] },
  { genre: 'War', contains: ['war stories', 'war fiction'] },
  { genre: 'Memoir', contains: ['memoir', 'memoirs'] },
  { genre: 'Biography', contains: ['biography', 'autobiography'] },
  { genre: 'Self-Help', contains: ['self help', 'self actualization psychology'] },
  { genre: 'Psychology', contains: ['psychology'] },
  { genre: 'Philosophy', contains: ['philosophy'] },
  { genre: 'Business', contains: ['business', 'economics', 'management'] },
  { genre: 'Politics', contains: ['politics', 'political science'] },
  { genre: 'Cooking', contains: ['cooking', 'cookbooks', 'cookery'] },
  { genre: 'Travel', exact: ['travel', 'voyages and travels', 'description and travel'] },
  { genre: 'Religion', exact: ['religion', 'christianity', 'spirituality', 'theology'] },
  { genre: 'Science', exact: ['science', 'popular science', 'physics', 'biology', 'astronomy', 'mathematics'] },
  { genre: 'History', exact: ['history', 'world history', 'military history'] },
  { genre: 'Essays', exact: ['essays'] },
  { genre: 'Drama', exact: ['drama', 'plays'] },
];

/** Lowercase, drop apostrophes, turn every other non-letter into one space. */
function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The canonical genre for one OpenLibrary subject, or null when not allowed. */
export function genreForSubject(subject: string): string | null {
  const s = normalizeSubject(subject);
  if (!s) return null;
  const padded = ` ${s} `;
  for (const rule of BOOK_GENRE_RULES) {
    if (rule.exact?.includes(s)) return rule.genre;
    if (rule.contains?.some((p) => padded.includes(` ${p} `))) return rule.genre;
  }
  return null;
}

/** Up to `max` distinct allow-listed genres from OpenLibrary subjects, in subject order. */
export function genresFromSubjects(subjects: unknown, max = 3): string[] {
  if (!Array.isArray(subjects)) return [];
  const out: string[] = [];
  for (const s of subjects) {
    if (typeof s !== 'string') continue;
    const g = genreForSubject(s);
    if (g && !out.includes(g)) out.push(g);
    if (out.length >= max) break;
  }
  return out;
}

/** Genre names: trimmed, de-duplicated, capped (see `uniqueNames`). */
export function normalizeGenres(list: unknown, max = Infinity): string[] {
  return uniqueNames(list, max);
}

/**
 * Any list of names (genres, people): trim, drop blanks and case-insensitive
 * duplicates, keep order, cap at `max`.
 */
export function uniqueNames(list: unknown, max = Infinity): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of list) {
    if (typeof g !== 'string') continue;
    const name = g.trim().replace(/\s+/g, ' ');
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

/** Last.fm tags that say something about the listener, not the music. */
const JUNK_TAGS = new Set([
  'seen live',
  'albums i own',
  'favorite',
  'favorites',
  'favourite',
  'favourites',
  'favorite albums',
  'favourite albums',
  'my favorite',
  'owned',
  'vinyl',
  'cd',
  'check out',
  'to listen',
  'awesome',
  'love',
  'beautiful',
  'best of',
  'albums',
  'under 2000 listeners',
]);

function titleCase(tag: string): string {
  return tag.replace(/(^|[\s\-/&])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** The top `max` usable Last.fm tags as genres ("indie rock" → "Indie Rock"). */
export function genresFromTags(tags: unknown, max = 3): string[] {
  if (!Array.isArray(tags)) return [];
  const names: string[] = [];
  for (const t of tags) {
    const raw = typeof t === 'string' ? t : (t as { name?: unknown } | null)?.name;
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().replace(/\s+/g, ' ').toLowerCase();
    // Skip junk, bare years ("2012") and decades-as-numbers.
    if (!tag || JUNK_TAGS.has(tag) || /^\d+$/.test(tag)) continue;
    names.push(titleCase(tag));
  }
  return normalizeGenres(names, max);
}
