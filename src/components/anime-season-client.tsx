'use client';

// ───────────────────────────────────────────────────────────────────────────
//  /anime/season (spec 5.11): season + year pickers and genre / format
//  filters; AniList's most popular first, 50 at a time with "More".
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { AddRowList } from '@/components/add-row-list';
import { useAddRows } from '@/components/add-row';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { settle } from '@/lib/action-result';
import { browseAnimeSeason } from '@/lib/actions/anime-season';
import {
  ANIME_FORMATS,
  ANIME_GENRES,
  ANIME_SEASONS,
  FORMAT_LABELS,
  MIN_SEASON_YEAR,
  SEASON_LABELS,
  type AnimeSeason,
} from '@/lib/anime-season';
import type { LibraryMarks } from '@/lib/data-search';
import type { NormalizedResult } from '@/lib/types';

const ALL = '__all';

export function AnimeSeasonClient({
  initialSeason,
  initialYear,
  maxYear,
}: {
  initialSeason: AnimeSeason;
  initialYear: number;
  maxYear: number;
}) {
  const [season, setSeason] = useState<AnimeSeason>(initialSeason);
  const [year, setYear] = useState(initialYear);
  const [genre, setGenre] = useState(ALL);
  const [format, setFormat] = useState(ALL);
  const [results, setResults] = useState<NormalizedResult[]>([]);
  const [marks, setMarks] = useState<LibraryMarks>({});
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = useAddRows();
  const latest = useRef(0);

  async function load(nextPage: number) {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const res = await settle(browseAnimeSeason({
        season,
        year,
        genre: genre === ALL ? null : genre,
        format: format === ALL ? null : format,
        page: nextPage,
      }));
      if (id !== latest.current) return;
      if (!res.ok) {
        setError(res.error ?? 'Could not load that season.');
        if (nextPage === 1) setResults([]);
        setMore(false);
      } else {
        const fresh = res.results ?? [];
        setResults((prev) => {
          if (nextPage === 1) return fresh;
          const seen = new Set(prev.map((r) => r.externalId));
          return [...prev, ...fresh.filter((r) => !seen.has(r.externalId))];
        });
        setMarks((prev) => (nextPage === 1 ? res.marks ?? {} : { ...prev, ...res.marks }));
        setMore(!!res.more);
        setPage(nextPage);
      }
    } catch {
      if (id === latest.current) setError('Could not load that season.');
    }
    if (id === latest.current) setLoading(false);
  }

  // Reload from the first page whenever the season or a filter changes.
  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, year, genre, format]);

  const years: number[] = [];
  for (let y = maxYear; y >= MIN_SEASON_YEAR; y--) years.push(y);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select value={season} onValueChange={(v) => setSeason(v as AnimeSeason)}>
          <SelectTrigger aria-label="Season">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANIME_SEASONS.map((s) => (
              <SelectItem key={s} value={s}>
                {SEASON_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger aria-label="Year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={genre} onValueChange={setGenre}>
          <SelectTrigger aria-label="Genre">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All genres</SelectItem>
            {ANIME_GENRES.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger aria-label="Format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All formats</SelectItem>
            {ANIME_FORMATS.map((f) => (
              <SelectItem key={f} value={f}>
                {FORMAT_LABELS[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-rose-500" role="alert">
          {error}
        </p>
      )}

      {results.length > 0 ? (
        <AddRowList
          label={`${SEASON_LABELS[season]} ${year} anime`}
          items={results.map((result) => ({ slug: 'anime' as const, result }))}
          marks={marks}
          rows={rows}
        />
      ) : (
        !loading &&
        !error && <p className="text-sm text-muted-foreground">Nothing found for this season and these filters.</p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading…
        </p>
      ) : (
        more && (
          <Button variant="outline" onClick={() => void load(page + 1)}>
            More
          </Button>
        )
      )}
    </div>
  );
}
