// Request-level behaviour of the detail fetchers, with `fetch` stubbed (no
// network): what counts as "not found" (stamp the row) versus a failure
// (throw, so the metadata job retries later).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import anilistAnime from './__fixtures__/anilist-anime.json';
import igdbDetails from './__fixtures__/igdb-game-details.json';
import igdbTtb from './__fixtures__/igdb-time-to-beat.json';
import lastfmError from './__fixtures__/lastfm-album-error.json';
import lastfmInfo from './__fixtures__/lastfm-album-getinfo.json';
import { fetchAniListDetails } from './anilist';
import { fetchGameDetails } from './igdb';
import { fetchAlbumDetails, mapAlbumInfo } from './music';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('AniList details batches', () => {
  it('keys al-N rows by the AniList id even when the entry now has a MAL id', async () => {
    const [frieren] = anilistAnime.data.Page.media;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const { query } = JSON.parse(String(init.body)) as { query: string };
      // The id_in lookup for `al-154587` answers with an entry that has idMal 52991.
      return json({ data: { Page: { media: query.includes('id_in') ? [frieren] : [] } } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const map = await fetchAniListDetails('ANIME', ['al-154587']);
    expect([...map.keys()]).toEqual(['al-154587']);
    expect(map.get('al-154587')).toMatchObject({ titleRomaji: 'Sousou no Frieren' });
  });

  it('keys MAL-id rows by the MAL id', async () => {
    const [frieren] = anilistAnime.data.Page.media;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const { query } = JSON.parse(String(init.body)) as { query: string };
        return json({ data: { Page: { media: query.includes('idMal_in') ? [frieren] : [] } } });
      }),
    );
    const map = await fetchAniListDetails('ANIME', ['52991']);
    expect([...map.keys()]).toEqual(['52991']);
  });
});

describe('IGDB game details', () => {
  beforeEach(() => {
    vi.stubEnv('IGDB_CLIENT_ID', 'id');
    vi.stubEnv('IGDB_CLIENT_SECRET', 'secret');
  });

  function stubIgdb(ttb: () => Response) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('https://id.twitch.tv/')) return json({ access_token: 't', expires_in: 3600 });
        if (url.endsWith('/games')) return json(igdbDetails);
        if (url.endsWith('/game_time_to_beats')) return ttb();
        throw new Error(`unexpected ${url}`);
      }),
    );
  }

  it('fills time to beat when IGDB has it', async () => {
    stubIgdb(() => json(igdbTtb));
    expect(await fetchGameDetails('119133')).toMatchObject({ timeToBeatHours: 60, steamAppId: 1245620 });
  });

  it('accepts a genuinely empty time-to-beat answer', async () => {
    stubIgdb(() => json([]));
    expect(await fetchGameDetails('119133')).toMatchObject({ timeToBeatHours: null, steamAppId: 1245620 });
  });

  it('throws on a rate-limited or failing time-to-beat request (no stamp)', async () => {
    stubIgdb(() => json({ message: 'Too Many Requests' }, 429));
    await expect(fetchGameDetails('119133')).rejects.toThrow(/time to beat failed \(429\)/);
    stubIgdb(() => json({}, 503));
    await expect(fetchGameDetails('119133')).rejects.toThrow(/\(503\)/);
  });
});

describe('Last.fm errors', () => {
  it('treats only error 6 as not found', () => {
    expect(mapAlbumInfo(lastfmError)).toBeNull();
    for (const error of [11, 16, 29, 10]) {
      expect(() => mapAlbumInfo({ error, message: 'nope' })).toThrow(`error ${error}`);
    }
  });

  it('fails the fetch on a rate limit, returns null for an unknown album', async () => {
    vi.stubEnv('LASTFM_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 29, message: 'Rate limit exceeded' }, 429)));
    await expect(fetchAlbumDetails('Cher', 'Believe')).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn(async () => json(lastfmError)));
    expect(await fetchAlbumDetails('Cher', 'Nope')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => json(lastfmInfo)));
    expect(await fetchAlbumDetails('Cher', 'Believe')).toEqual({ genres: ['Pop', 'Dance', 'Synth-Pop'], trackCount: 3 });
  });
});

describe('enrichResult (on add)', () => {
  const hit = {
    externalId: '/works/OL893414W',
    title: 'dune (client text)',
    imageUrl: null,
    subtitle: null,
    year: 1965,
    description: null,
    fields: { externalId: '/works/OL893414W', title: 'dune (client text)', imageUrl: 'https://evil.example/x.jpg' },
  };

  it('takes the display core from the provider and stamps the lookup outside `fields`', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ title: 'Dune', covers: [6979861], description: 'Spice.', subjects: ['Fiction'] })),
    );
    const { enrichResult } = await import('./index');
    const { result, metaFetchedAt } = await enrichResult('books', hit);
    expect(result.fields).toMatchObject({
      title: 'Dune',
      imageUrl: 'https://covers.openlibrary.org/b/id/6979861-L.jpg',
      description: 'Spice.',
    });
    expect(result.fields).not.toHaveProperty('metaFetchedAt');
    expect(metaFetchedAt).toBeInstanceOf(Date);
  });

  it('gives no stamp when the provider does not know the id or fails', async () => {
    const { enrichResult } = await import('./index');
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 404)));
    expect(await enrichResult('books', hit)).toEqual({ result: hit, metaFetchedAt: null });
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 503)));
    expect(await enrichResult('books', hit)).toEqual({ result: hit, metaFetchedAt: null });
  });

  it('never looks up manual rows', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { enrichResult } = await import('./index');
    const manual = { ...hit, externalId: 'manual:x' };
    expect(await enrichResult('books', manual)).toEqual({ result: manual, metaFetchedAt: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('looks AniList entries up instead of trusting the hit', async () => {
    const [frieren] = anilistAnime.data.Page.media;
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: { Page: { media: [frieren] } } })));
    const { enrichResult } = await import('./index');
    const animeHit = { ...hit, externalId: '52991', fields: { externalId: '52991', title: 'Forged' } };
    const { result, metaFetchedAt } = await enrichResult('anime', animeHit);
    expect(result.fields).toMatchObject({ title: 'Frieren: Beyond Journey’s End', malScore: 9 });
    expect(metaFetchedAt).toBeInstanceOf(Date);
  });
});

describe('steamExternalBatchQuery (8.1)', () => {
  it('asks for every Steam app id at once', async () => {
    const { steamExternalBatchQuery } = await import('./igdb');
    expect(steamExternalBatchQuery([620, 400, 620])).toBe(
      'where uid = ("620","400") & external_game_source = 1; fields game,uid; limit 500;',
    );
    expect(steamExternalBatchQuery([0, -1])).toBeNull();
  });
});
