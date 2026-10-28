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
