// ───────────────────────────────────────────────────────────────────────────
//  Taste profile (spec 7.2). Pure and client-safe.
//
//  `computeTasteProfile` turns one user's titles (the visible sections, as
//  src/lib/data-stats.ts loads them) into a small, deterministic summary that
//  is stored as versioned JSON in `TasteProfile.data`:
//    - genre weights: the top 10 genres of finished titles, by a score-
//      weighted count (each title adds its score ÷ 10; unrated ones 0.5);
//    - average score per section and per genre (at least 3 rated titles);
//    - drop rate per section (dropped ÷ ended, as on the Overview tab);
//    - favourite eras: the top 3 release decades of finished titles;
//    - the top S/A tier titles per section (titles only, at most 5 each).
//  `tasteSentences` words it for people (the Taste tab, in the user's score
//  format) and for the AI prompts (0–10), which never get raw rows.
// ───────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

import { CATEGORY_SLUGS, NAV_ORDER, type CategorySlug } from '@/lib/categories';
import { formatScore, formatScoreDiff, type ScoreFormat } from '@/lib/rating';
import { countsAsFinished, mean1 } from './measures';
import type { StatTitle } from './types';

/** Finished titles a user needs before the Sunday job builds a profile. */
export const MIN_FINISHED_FOR_PROFILE = 5;
/** Rated titles behind a section's or genre's average. */
export const MIN_FOR_AVERAGE = 3;
/** Ended titles behind a drop rate that gets a sentence. */
const MIN_ENDED_FOR_DROP_SENTENCE = 3;
const TOP_GENRES = 10;
const MAX_GENRE_SCORES = 20;
const TOP_ERAS = 3;
const TOP_PER_SECTION = 5;
/** What an unrated finished title adds to a genre's weight (a neutral 5/10). */
const UNRATED_WEIGHT = 0.5;

const slugEnum = z.enum(CATEGORY_SLUGS as [CategorySlug, ...CategorySlug[]]);

export const TasteProfileSchema = z.object({
  v: z.literal(1),
  /** Finished titles behind the profile. */
  finished: z.number().int().min(0),
  genres: z.array(z.object({ genre: z.string(), count: z.number().int(), weight: z.number() })),
  genreScores: z.array(z.object({ genre: z.string(), avgScore: z.number(), count: z.number().int() })),
  sections: z.array(
    z.object({
      slug: slugEnum,
      titles: z.number().int(),
      finished: z.number().int(),
      rated: z.number().int(),
      /** null below MIN_FOR_AVERAGE rated titles. */
      avgScore: z.number().nullable(),
      dropped: z.number().int(),
      ended: z.number().int(),
      /** dropped ÷ ended (0–1), null when nothing ended. */
      dropRate: z.number().nullable(),
    }),
  ),
  eras: z.array(z.object({ decade: z.number().int(), count: z.number().int() })),
  top: z.array(z.object({ slug: slugEnum, titles: z.array(z.string()) })),
});

export type TasteProfile = z.infer<typeof TasteProfileSchema>;

/** The stored JSON → a profile, or null when missing, malformed or another version. */
export function parseTasteProfile(json: unknown): TasteProfile | null {
  const parsed = TasteProfileSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** A title's distinct genres (trimmed, case-insensitive; first spelling kept). */
function genresOf(t: StatTitle): { key: string; genre: string }[] {
  const seen = new Set<string>();
  const out: { key: string; genre: string }[] = [];
  for (const raw of t.media.genres) {
    const genre = raw.trim();
    const key = genre.toLowerCase();
    if (!genre || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, genre });
  }
  return out;
}

const TIER_RANK: Record<string, number> = { S: 0, A: 1 };

/** The deterministic taste profile of one user's titles. */
export function computeTasteProfile(rows: readonly StatTitle[]): TasteProfile {
  const finished = rows.filter(countsAsFinished);

  // Genres: count and score-weighted count over finished titles; averages over rated ones.
  const genres = new Map<string, { genre: string; count: number; weight: number; scores: number[] }>();
  for (const t of finished) {
    for (const { key, genre } of genresOf(t)) {
      const g = genres.get(key) ?? { genre, count: 0, weight: 0, scores: [] };
      g.count += 1;
      g.weight += t.rating != null ? t.rating / 10 : UNRATED_WEIGHT;
      if (t.rating != null) g.scores.push(t.rating);
      genres.set(key, g);
    }
  }
  const all = [...genres.values()];
  const topGenres = [...all]
    .sort((a, b) => b.weight - a.weight || b.count - a.count || a.genre.localeCompare(b.genre))
    .slice(0, TOP_GENRES)
    .map((g) => ({ genre: g.genre, count: g.count, weight: round2(g.weight) }));
  const genreScores = all
    .filter((g) => g.scores.length >= MIN_FOR_AVERAGE)
    .map((g) => ({ genre: g.genre, avgScore: mean1(g.scores) as number, count: g.scores.length }))
    .sort((a, b) => b.avgScore - a.avgScore || b.count - a.count || a.genre.localeCompare(b.genre))
    .slice(0, MAX_GENRE_SCORES);

  // Sections, in navigation order, that have any title.
  const sections = NAV_ORDER.flatMap((slug) => {
    const mine = rows.filter((t) => t.category === slug);
    if (mine.length === 0) return [];
    const rated = mine.filter((t) => t.rating != null).map((t) => t.rating as number);
    const dropped = mine.filter((t) => t.status === 'DROPPED').length;
    const ended = mine.filter((t) => t.status === 'DROPPED' || t.status === 'COMPLETED' || t.status === 'RETIRED').length;
    return [
      {
        slug,
        titles: mine.length,
        finished: mine.filter(countsAsFinished).length,
        rated: rated.length,
        avgScore: rated.length >= MIN_FOR_AVERAGE ? mean1(rated) : null,
        dropped,
        ended,
        dropRate: ended ? round2(dropped / ended) : null,
      },
    ];
  });

  // Eras: decades of finished titles' release years.
  const decades = new Map<number, number>();
  for (const t of finished) {
    const y = t.media.year;
    if (y == null || !Number.isInteger(y) || y < 1000 || y > 3000) continue;
    const d = Math.floor(y / 10) * 10;
    decades.set(d, (decades.get(d) ?? 0) + 1);
  }
  const eras = [...decades.entries()]
    .map(([decade, count]) => ({ decade, count }))
    .sort((a, b) => b.count - a.count || b.decade - a.decade)
    .slice(0, TOP_ERAS);

  // Top S/A titles per section: S before A, then score, then title.
  const top = NAV_ORDER.flatMap((slug) => {
    const titles = rows
      .filter((t) => t.category === slug && t.tier != null && t.tier in TIER_RANK)
      .sort(
        (a, b) =>
          TIER_RANK[a.tier as string] - TIER_RANK[b.tier as string] ||
          (b.rating ?? -1) - (a.rating ?? -1) ||
          a.media.title.localeCompare(b.media.title),
      )
      .slice(0, TOP_PER_SECTION)
      .map((t) => t.media.title);
    return titles.length ? [{ slug, titles }] : [];
  });

  return { v: 1, finished: finished.length, genres: topGenres, genreScores, sections, eras, top };
}

// ── Words ───────────────────────────────────────────────────────────────────

/** How a section reads inside a sentence ("you drop 30% of TV"). */
export const SECTION_NOUN: Record<CategorySlug, string> = {
  books: 'books',
  movies: 'films',
  tv: 'TV',
  anime: 'anime',
  manga: 'manga',
  games: 'games',
  music: 'albums',
};

/** "a", "a and b", "a, b and c". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * The profile in plain sentences: "You love Sports and Drama.", "You rate
 * anime 0.8 higher than films.", "You drop 30% of TV.", … Scores use
 * `format` (the AI prompts use the 0–10 'ten' format). Empty when there is
 * nothing to say.
 */
export function tasteSentences(p: TasteProfile, format: ScoreFormat = 'ten'): string[] {
  const out: string[] = [];
  const loved = p.genres.slice(0, 3).map((g) => g.genre);
  if (loved.length) out.push(`You love ${listWords(loved)}.`);

  const scored = p.sections.filter((s) => s.avgScore != null) as (TasteProfile['sections'][number] & { avgScore: number })[];
  if (scored.length >= 2) {
    const sorted = [...scored].sort((a, b) => b.avgScore - a.avgScore);
    const hi = sorted[0];
    const lo = sorted[sorted.length - 1];
    const diff = hi.avgScore - lo.avgScore;
    if (Math.round(diff * 10) === 0) {
      out.push('You score every section about the same.');
    } else {
      out.push(`You rate ${SECTION_NOUN[hi.slug]} ${formatScoreDiff(diff, format).slice(1)} higher than ${SECTION_NOUN[lo.slug]}.`);
    }
  }

  const drops = p.sections
    .filter((s) => s.ended >= MIN_ENDED_FOR_DROP_SENTENCE && s.dropRate != null)
    .sort((a, b) => (b.dropRate as number) - (a.dropRate as number));
  const dropping = drops.filter((s) => (s.dropRate as number) > 0).slice(0, 3);
  if (dropping.length) {
    out.push(`You drop ${listWords(dropping.map((s) => `${pct(s.dropRate as number)} of ${SECTION_NOUN[s.slug]}`))} you start.`);
  } else if (drops.length) {
    out.push('You finish what you start: no drops yet.');
  }

  if (p.genreScores.length >= 2) {
    const best = p.genreScores[0];
    const worst = p.genreScores[p.genreScores.length - 1];
    if (best.avgScore > worst.avgScore) {
      out.push(
        `Your best-rated genre is ${best.genre} (${formatScore(best.avgScore, format)}); your lowest is ${worst.genre} (${formatScore(worst.avgScore, format)}).`,
      );
    }
  } else if (p.genreScores.length === 1) {
    out.push(`Your best-rated genre is ${p.genreScores[0].genre} (${formatScore(p.genreScores[0].avgScore, format)}).`);
  }

  if (p.eras.length) {
    out.push(
      `Your favourite ${p.eras.length === 1 ? 'era is' : 'eras are'} the ${listWords(p.eras.map((e) => `${e.decade}s`))}.`,
    );
  }
  return out;
}

/**
 * The profile as prompt lines for Gemini (spec 7.2: the summary, never raw
 * rows): the sentences on the 0–10 scale, plus favourites per section when
 * `withFavourites`. Empty for no profile.
 */
export function tastePromptLines(
  p: TasteProfile | null,
  labels: Record<CategorySlug, string>,
  { withFavourites = true }: { withFavourites?: boolean } = {},
): string[] {
  if (!p) return [];
  const lines = ['Their taste profile (scores on a 0–10 scale):', ...tasteSentences(p, 'ten').map((s) => `- ${s}`)];
  if (withFavourites && p.top.length) {
    lines.push(`- Favourites: ${p.top.map((t) => `${labels[t.slug]}: ${t.titles.join(', ')}`).join('; ')}.`);
  }
  return lines.length > 1 ? lines : [];
}

/**
 * Whether the Sunday job should rebuild a profile: always when there is
 * none, else only when something happened (an event or diary entry) after
 * it was built.
 */
export function needsTasteRefresh(profileUpdatedAt: Date | null, lastActivityAt: Date | null): boolean {
  if (!profileUpdatedAt) return true;
  if (!lastActivityAt) return false;
  return lastActivityAt.getTime() > profileUpdatedAt.getTime();
}
