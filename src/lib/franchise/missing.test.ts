import { describe, expect, it } from 'vitest';

import { franchiseGamesQuery } from '@/lib/apis/igdb';
import { mapCollectionParts } from '@/lib/apis/tmdb';

import {
  aniListStart,
  missingTitles,
  nodesToTitles,
  providerKeys,
  sameIpNeighbours,
  walkAniList,
  type AniListGraphNode,
} from './missing';
import { initialTicked } from './missing-pick';

const node = (
  id: number,
  type: 'ANIME' | 'MANGA',
  edges: Array<[string, number]> = [],
  extra: Partial<AniListGraphNode> = {},
): AniListGraphNode => ({
  id,
  idMal: id * 10,
  type,
  format: type === 'ANIME' ? 'TV' : 'MANGA',
  title: { english: `Title ${id}`, romaji: null },
  seasonYear: 2000 + id,
  startDate: { year: 2000 + id },
  relations: { edges: edges.map(([relationType, to]) => ({ relationType, node: { id: to } })) },
  ...extra,
});

describe('AniList relation filtering', () => {
  it('follows same-IP relations only (no CHARACTER / OTHER crossovers)', () => {
    const n = node(1, 'ANIME', [
      ['SEQUEL', 2],
      ['ADAPTATION', 3],
      ['CHARACTER', 4],
      ['OTHER', 5],
      ['SIDE_STORY', 6],
      ['SPIN_OFF', 7],
    ]);
    expect(sameIpNeighbours([n])).toEqual([2, 3, 6]);
  });

  it('starts from MAL ids per type and al- ids, skipping other sections', () => {
    expect(
      aniListStart([
        { slug: 'anime', externalId: '5114' },
        { slug: 'manga', externalId: '25' },
        { slug: 'anime', externalId: 'al-170942' },
        { slug: 'movies', externalId: '603' },
        { slug: 'anime', externalId: 'manual:abc' },
      ]),
    ).toEqual({ mal: { ANIME: [5114], MANGA: [25] }, al: [170942] });
  });

  it('walks the graph breadth first, pacing calls and never refetching', async () => {
    const graph = new Map<number, AniListGraphNode>([
      [1, node(1, 'ANIME', [['SEQUEL', 2], ['SOURCE', 3], ['CHARACTER', 99]])],
      [2, node(2, 'ANIME', [['PREQUEL', 1], ['SEQUEL', 4]])],
      [3, node(3, 'MANGA', [['ADAPTATION', 1]])],
      [4, node(4, 'ANIME', [['PREQUEL', 2]])],
      [99, node(99, 'ANIME')],
    ]);
    const calls: string[] = [];
    const nodes = await walkAniList(
      { mal: { ANIME: [10], MANGA: [] }, al: [] },
      {
        byMal: async (type, ids) => {
          calls.push(`mal:${type}:${ids}`);
          return [...graph.values()].filter((n) => n.type === type && ids.includes(n.idMal!));
        },
        byIds: async (ids) => {
          calls.push(`ids:${ids}`);
          return ids.map((id) => graph.get(id)!).filter(Boolean);
        },
        pause: async () => void calls.push('pause'),
      },
    );
    expect(nodes.map((n) => n.id).sort()).toEqual([1, 2, 3, 4]);
    expect(calls).toEqual(['mal:ANIME:10', 'pause', 'ids:2,3', 'pause', 'ids:4']);
  });
});

describe('missing titles', () => {
  it('maps nodes with the search mappers, leaving out music videos and adult entries', () => {
    const titles = nodesToTitles([
      node(1, 'ANIME'),
      node(2, 'MANGA'),
      node(3, 'ANIME', [], { format: 'MUSIC' }),
      node(4, 'ANIME', [], { isAdult: true }),
    ]);
    expect(titles.map((t) => [t.slug, t.result.externalId, t.result.title])).toEqual([
      ['anime', '10', 'Title 1'],
      ['manga', '20', 'Title 2'],
    ]);
    expect(titles[0].result.fields).toMatchObject({ externalId: '10', year: 2001 });
  });

  it('is the set difference with the library, deduped and sorted by year', () => {
    const t = (slug: 'anime' | 'manga', id: string, year: number | null) => ({
      slug,
      result: { externalId: id, title: `T${id}`, year, imageUrl: null, subtitle: null, description: null, fields: {} },
    });
    const out = missingTitles(
      [t('anime', '3', 2010), t('anime', '1', 2001), t('manga', '1', 1999), t('anime', '2', null), t('anime', '3', 2010), t('anime', '4', 2005)],
      new Set(['anime|4', 'movies|3']),
    );
    expect(out.map((x) => `${x.slug}|${x.result.externalId}`)).toEqual(['anime|1', 'anime|3', 'anime|2', 'manga|1']);
  });

  it('reads TMDB collection and IGDB franchise keys from the members', () => {
    expect(providerKeys(['tmdb-col:10', 'tmdb-col:10', 'igdb-fr:12', 'igdb-col:34', 'anilist:5', null, 'tmdb-col:x'])).toEqual({
      tmdbCollections: [10],
      igdb: ['igdb-fr:12', 'igdb-col:34'],
    });
  });

  it('maps a TMDB collection to its films, oldest first', () => {
    const parts = mapCollectionParts({
      id: 2344,
      name: 'The Matrix Collection',
      parts: [
        { id: 604, title: 'The Matrix Reloaded', release_date: '2003-05-15', poster_path: '/r.jpg', overview: 'Neo…', vote_average: 7, genre_ids: [28] },
        { id: 603, title: 'The Matrix', release_date: '1999-03-30', poster_path: '/m.jpg', overview: 'A hacker…', vote_average: 8.2, genre_ids: [28, 878] },
        { id: 999, title: 'Untitled Matrix', release_date: '', poster_path: null },
      ],
    });
    expect(parts.map((p) => [p.externalId, p.year])).toEqual([
      ['603', 1999],
      ['604', 2003],
      ['999', null],
    ]);
    expect(parts[0].fields).toMatchObject({ externalId: '603', title: 'The Matrix', releaseDate: '1999-03-30', genres: ['Action', 'Science Fiction'] });
    expect(mapCollectionParts({})).toEqual([]);
  });

  it('builds the IGDB query for franchise and collection keys only', () => {
    expect(franchiseGamesQuery('igdb-fr:12')).toMatch(/where franchises = \(12\) & version_parent = null & parent_game = null;/);
    expect(franchiseGamesQuery('igdb-col:34')).toMatch(/where collections = \(34\)/);
    expect(franchiseGamesQuery('igdb-fr:1; fields *')).toBeNull();
    expect(franchiseGamesQuery('tmdb-col:1')).toBeNull();
  });

  it('ticks a short list (≤ 10) and leaves a long one unticked', () => {
    const keys = (n: number) => Array.from({ length: n }, (_, i) => `anime|${i}`);
    expect(initialTicked(keys(10)).size).toBe(10);
    expect(initialTicked(keys(11)).size).toBe(0);
    expect(initialTicked([]).size).toBe(0);
  });
});
