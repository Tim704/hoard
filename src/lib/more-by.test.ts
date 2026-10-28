import { describe, expect, it } from 'vitest';

import { mapAniListPeople, type AniListPeopleJson } from '@/lib/apis/anilist';
import { pickAuthorKey } from '@/lib/apis/books';
import { developedGamesQuery, gameDevelopersQuery, gamesByIdsQuery } from '@/lib/apis/igdb';
import { mapTopAlbums } from '@/lib/apis/music';
import { mapCombinedCredits } from '@/lib/apis/tmdb';
import { pickPeople, trimGroups, type MoreByGroup } from '@/lib/more-by';

describe('pickPeople', () => {
  it('directors first, then cast, each once, at most two', () => {
    expect(pickPeople(['Denis Villeneuve'], ['Timothée Chalamet', 'Zendaya'])).toEqual(['Denis Villeneuve', 'Timothée Chalamet']);
    expect(pickPeople([], ['A', 'A', 'B'])).toEqual(['A', 'B']);
    expect(pickPeople([], [])).toEqual([]);
  });
});

describe('trimGroups', () => {
  const r = (id: string) => ({ externalId: id, title: id, imageUrl: null, subtitle: null, year: null, description: null, fields: {} });
  const groups: MoreByGroup[] = [
    { label: 'A', items: ['1', '2', '3', '4'].map((id) => ({ slug: 'movies' as const, result: r(id) })) },
    { label: 'B', items: [{ slug: 'movies', result: r('2') }] },
  ];
  it('drops the title itself and library titles, caps each group and drops empty ones', () => {
    const out = trimGroups(groups, { slug: 'movies', externalId: '1' }, (_s, id) => id === '2', 1);
    expect(out).toEqual([{ label: 'A', items: [{ slug: 'movies', result: r('3') }] }]);
  });
});

describe('mapCombinedCredits (TMDB person combined credits)', () => {
  const json = {
    cast: [
      { id: 1, media_type: 'movie', title: 'Low', popularity: 5, release_date: '2001-01-01', poster_path: '/a.jpg' },
      { id: 2, media_type: 'tv', name: 'The Tonight Show', popularity: 99, genre_ids: [10767] },
      { id: 3, media_type: 'tv', name: 'Drama Show', popularity: 50, first_air_date: '2019-05-01', genre_ids: [18] },
      { id: 1, media_type: 'movie', title: 'Low', popularity: 5 },
      { id: 4, media_type: 'person', name: 'nope' },
    ],
    crew: [{ id: 5, media_type: 'movie', title: 'High', popularity: 20 }, { id: 6, media_type: 'movie', title: '' }],
  };
  it('mixes films and shows, most popular first, without talk shows or duplicates', () => {
    const out = mapCombinedCredits(json);
    expect(out.map((o) => `${o.slug}:${o.result.externalId}`)).toEqual(['tv:3', 'movies:5', 'movies:1']);
    expect(out[0].result).toMatchObject({ title: 'Drama Show', year: 2019 });
    expect(out[2].result.imageUrl).toBe('https://image.tmdb.org/t/p/w500/a.jpg');
  });
});

describe('mapAniListPeople (studio and main staff)', () => {
  const work = (id: number, title: string, type = 'ANIME') => ({ id, idMal: id * 10, type, title: { english: title } });
  const json: AniListPeopleJson = {
    studios: { nodes: [{ name: 'Madhouse', media: { nodes: [work(1, 'Self'), work(2, 'Monster'), { ...work(3, 'Adult'), isAdult: true }] } }] },
    staff: {
      edges: [
        { role: 'Original Creator', node: { name: { full: 'Kanehito Yamada' }, staffMedia: { nodes: [work(4, 'Manga', 'MANGA')] } } },
        { role: 'Director (eps 1-28)', node: { name: { full: 'Keiichirou Saitou' }, staffMedia: { nodes: [work(5, 'Bocchi')] } } },
        { role: 'Music', node: { name: { full: 'Evan Call' }, staffMedia: { nodes: [work(6, 'Other')] } } },
      ],
    },
  };
  it('groups the studio and the first two staff, leaving out the title itself and adult entries', () => {
    const out = mapAniListPeople(json, 'ANIME', 1);
    expect(out.map((g) => g.label)).toEqual([
      'More from Madhouse',
      'More by Kanehito Yamada (Original Creator)',
      'More by Keiichirou Saitou (Director)',
    ]);
    expect(out[0].results.map((r) => r.result.title)).toEqual(['Monster']);
    expect(out[1].results[0]).toMatchObject({ slug: 'manga', result: { externalId: '40' } });
  });
  it('manga has no studio group', () => {
    expect(mapAniListPeople(json, 'MANGA', 1).map((g) => g.label)[0]).toBe('More by Kanehito Yamada (Original Creator)');
  });
});

describe('IGDB developer queries', () => {
  it('builds the involved_companies and games bodies', () => {
    expect(gameDevelopersQuery('1942')).toBe('fields company.name; where game = 1942 & developer = true; limit 5;');
    expect(gameDevelopersQuery('1; drop')).toBeNull();
    expect(developedGamesQuery(70)).toContain('where company = 70 & developer = true');
    const q = gamesByIdsQuery([1, 2, 2, 1942], 1942)!;
    expect(q).toContain('where id = (1,2) & version_parent = null & parent_game = null');
    expect(q).toContain('sort total_rating_count desc');
    expect(gamesByIdsQuery([1942], 1942)).toBeNull();
  });
});

describe('mapTopAlbums (Last.fm artist.getTopAlbums)', () => {
  it('maps albums like search, skipping "(null)" placeholders and duplicates', () => {
    const out = mapTopAlbums(
      {
        topalbums: {
          album: [
            { name: 'In Rainbows', mbid: 'mb-1', artist: { name: 'Radiohead' }, image: [{ size: 'extralarge', '#text': 'https://img/x.png' }] },
            { name: '(null)', mbid: '' },
            { name: 'Kid A', mbid: '', artist: { name: 'Radiohead' } },
            { name: 'In Rainbows', mbid: 'mb-1' },
          ],
        },
      },
      'Radiohead',
    );
    expect(out.map((r) => r.externalId)).toEqual(['mb-1', 'Radiohead::Kid A']);
    expect(out[0]).toMatchObject({ title: 'In Rainbows', imageUrl: 'https://img/x.png', fields: { artist: 'Radiohead' } });
  });
  it('accepts a single object instead of an array', () => {
    expect(mapTopAlbums({ topalbums: { album: { name: 'Solo', mbid: 'm' } as never } }, 'X')).toHaveLength(1);
  });
});

describe('pickAuthorKey (OpenLibrary author search)', () => {
  it('prefers the exact name with the most works, else the top hit', () => {
    const docs = [
      { key: 'OL1A', name: 'Someone Else', work_count: 900 },
      { key: 'OL2A', name: 'J. K. Rowling', work_count: 1 },
      { key: 'OL23919A', name: 'J.K. Rowling', work_count: 411 },
      { key: 'bad', name: 'J. K. Rowling', work_count: 9999 },
    ];
    expect(pickAuthorKey(docs, 'J. K. Rowling')).toBe('OL23919A');
    expect(pickAuthorKey(docs, 'Nobody')).toBe('OL1A');
    expect(pickAuthorKey([], 'x')).toBeNull();
  });
});
