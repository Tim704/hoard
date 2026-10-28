import { describe, expect, it, vi } from 'vitest';

import type { CategorySlug } from '@/lib/categories';

import { pickMetadataRows, runMetadata, staleCutoff, type MetadataDeps, type MetadataRow } from './metadata';

const NOW = new Date('2026-10-29T02:30:00Z'); // 03:30 Berlin
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function row(slug: CategorySlug, externalId: string, metaFetchedAt: Date | null = null): MetadataRow {
  return { id: `${slug}-${externalId}`, slug, externalId, title: externalId, metaFetchedAt };
}

function fakeDeps(rows: MetadataRow[], over: Partial<MetadataDeps> = {}) {
  const updates: Array<{ slug: CategorySlug; id: string; data: Record<string, unknown> }> = [];
  const deps: MetadataDeps = {
    configured: () => true,
    findDue: async (slug, _cutoff, take) => rows.filter((r) => r.slug === slug).slice(0, take),
    update: async (slug, id, data) => {
      updates.push({ slug, id, data });
    },
    fetchPatch: vi.fn(async (_slug: CategorySlug, src: { externalId: string }) => ({
      genres: [`g-${src.externalId}`],
    })),
    fetchAniList: vi.fn(
      async (_type: 'ANIME' | 'MANGA', ids: string[]) =>
        new Map<string, Record<string, unknown>>(ids.map((id) => [id, { titleRomaji: `r-${id}` }])),
    ),
    sleep: vi.fn(async () => {}),
    ...over,
  };
  return { deps, updates };
}

describe('pickMetadataRows', () => {
  it('skips manual, demo and fresh rows; never-fetched first, then oldest; capped', () => {
    const picked = pickMetadataRows(
      [
        row('movies', '1', daysAgo(40)),
        row('movies', 'manual:abc'),
        row('books', 'demo-book-dune'),
        row('tv', '2', daysAgo(5)), // fresh
        row('games', '3'),
        row('music', '4', daysAgo(90)),
        row('anime', '5'),
      ],
      NOW,
      3,
    );
    expect(picked.map((r) => r.externalId)).toEqual(['3', '5', '4']);
  });

  it('uses a 30-day cutoff', () => {
    expect(staleCutoff(NOW).toISOString()).toBe('2026-09-29T02:30:00.000Z');
    expect(pickMetadataRows([row('movies', '1', daysAgo(29))], NOW)).toEqual([]);
    expect(pickMetadataRows([row('movies', '1', daysAgo(31))], NOW)).toHaveLength(1);
  });
});

describe('runMetadata', () => {
  it('does nothing for categories without keys, and never errors', async () => {
    const { deps, updates } = fakeDeps([row('movies', '1'), row('games', '2'), row('music', '3')], {
      configured: (slug) => !['movies', 'tv', 'games', 'music'].includes(slug),
    });
    const summary = await runMetadata(deps, NOW);
    expect(summary).toEqual({ checked: 0, updated: 0, notFound: 0, failed: [] });
    expect(updates).toEqual([]);
    expect(deps.fetchPatch).not.toHaveBeenCalled();
  });

  it('patches rows, stamps metaFetchedAt, batches AniList and pauses between calls', async () => {
    const { deps, updates } = fakeDeps([row('movies', '1'), row('books', '/works/OL1W'), row('anime', '52991'), row('manga', '7')]);
    const summary = await runMetadata(deps, NOW, { delayMs: 300 });
    expect(summary).toMatchObject({ checked: 4, updated: 4, notFound: 0, failed: [] });
    expect(deps.fetchAniList).toHaveBeenCalledWith('ANIME', ['52991']);
    expect(deps.fetchAniList).toHaveBeenCalledWith('MANGA', ['7']);
    expect(deps.fetchPatch).toHaveBeenCalledTimes(2);
    expect(deps.sleep).toHaveBeenCalledTimes(1); // between the two single calls
    expect(updates).toContainEqual({ slug: 'movies', id: 'movies-1', data: { genres: ['g-1'], metaFetchedAt: NOW } });
    expect(updates).toContainEqual({
      slug: 'anime',
      id: 'anime-52991',
      data: { titleRomaji: 'r-52991', metaFetchedAt: NOW },
    });
  });

  it('stamps rows the provider does not know, and reports failures without stamping them', async () => {
    const { deps, updates } = fakeDeps([row('movies', 'gone'), row('movies', 'boom'), row('tv', 'ok')], {
      fetchPatch: vi.fn(async (_slug, src) => {
        if (src.externalId === 'gone') return null;
        if (src.externalId === 'boom') throw new Error('TMDB movie details failed (500)');
        return { status: 'Ended' };
      }),
    });
    await expect(runMetadata(deps, NOW)).rejects.toThrow(/1 of 3 lookups failed: movies boom/);
    expect(updates.map((u) => u.id).sort()).toEqual(['movies-gone', 'tv-ok']);
    expect(updates.find((u) => u.id === 'movies-gone')?.data).toEqual({ metaFetchedAt: NOW });
  });

  it('respects the nightly limit across categories', async () => {
    const many = Array.from({ length: 150 }, (_, i) => row('movies', `m${i}`)).concat(
      Array.from({ length: 150 }, (_, i) => row('books', `/works/OL${i}W`)),
    );
    const { deps, updates } = fakeDeps(many);
    const summary = await runMetadata(deps, NOW, { delayMs: 0 });
    expect(summary.checked).toBe(200);
    expect(updates).toHaveLength(200);
  });

  it('fails a whole AniList batch softly when the request fails', async () => {
    const { deps, updates } = fakeDeps([row('anime', '1'), row('anime', '2'), row('movies', '3')], {
      fetchAniList: vi.fn(async () => {
        throw new Error('AniList details failed (timeout/network)');
      }),
    });
    await expect(runMetadata(deps, NOW)).rejects.toThrow(/2 of 3 lookups failed/);
    expect(updates.map((u) => u.id)).toEqual(['movies-3']);
  });
});
