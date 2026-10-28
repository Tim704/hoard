import { describe, expect, it } from 'vitest';

import anilistLinks from './apis/__fixtures__/anilist-external-links.json';
import providerList from './apis/__fixtures__/tmdb-provider-list.json';
import watchProviders from './apis/__fixtures__/tmdb-watch-providers.json';
import {
  WATCH_CACHE_TTL_MS,
  isCacheFresh,
  isMyService,
  mapAniListStreaming,
  mapProviderList,
  mapTmdbWatchProviders,
  mineFirst,
  myStreamOffers,
  normalizeProviderName,
  watchCacheKey,
} from './streaming';

describe('mapTmdbWatchProviders', () => {
  it('groups flatrate + ads as stream (each provider once), by display priority', () => {
    const p = mapTmdbWatchProviders(watchProviders, 'DE');
    expect(p.link).toBe('https://www.themoviedb.org/movie/550-fight-club/watch?locale=DE');
    expect(p.stream.map((o) => o.name)).toEqual(['Amazon Prime Video', 'Netflix', 'Rakuten TV']);
    expect(p.stream[1]).toEqual({
      id: 8,
      name: 'Netflix',
      logo: 'https://image.tmdb.org/t/p/w92/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg',
      url: null,
    });
    expect(p.rent.map((o) => o.id)).toEqual([10, 2]);
    expect(p.buy.map((o) => o.id)).toEqual([2]); // malformed entry skipped
  });

  it('reads only the asked region; an unknown region or junk gives empty groups', () => {
    expect(mapTmdbWatchProviders(watchProviders, 'US').stream.map((o) => o.name)).toEqual(['Hulu']);
    for (const p of [mapTmdbWatchProviders(watchProviders, 'FR'), mapTmdbWatchProviders(null, 'DE')]) {
      expect(p).toEqual({ source: 'tmdb', link: null, stream: [], rent: [], buy: [] });
    }
    // An inherited key is not a region.
    expect(mapTmdbWatchProviders({ results: {} }, 'constructor').stream).toEqual([]);
  });
});

describe('mapAniListStreaming', () => {
  it('keeps STREAMING links with https urls, each site once (case-insensitive)', () => {
    const p = mapAniListStreaming(anilistLinks);
    expect(p.source).toBe('anilist');
    expect(p.stream.map((o) => o.name)).toEqual(['Crunchyroll', 'Netflix', 'Shady']);
    expect(p.stream[0].url).toMatch(/^https:\/\/www\.crunchyroll\.com\//);
    expect(p.stream[2]).toEqual({ id: null, name: 'Shady', logo: null, url: null });
    expect(mapAniListStreaming(null).stream).toEqual([]);
  });
});

describe('mapProviderList', () => {
  it('orders services by priority and drops nameless ones', () => {
    expect(mapProviderList(providerList).map((p) => p.id)).toEqual([119, 8, 283]);
    expect(mapProviderList({})).toEqual([]);
  });
});

describe('watchCacheKey', () => {
  it('builds per-region keys for TMDB titles and region-free keys for anime', () => {
    expect(watchCacheKey('movies', '603', 'DE')).toBe('movie:603:DE');
    expect(watchCacheKey('tv', '1399', 'US')).toBe('tv:1399:US');
    expect(watchCacheKey('anime', '52991', 'DE')).toBe('anime:52991');
    expect(watchCacheKey('anime', 'al-12', null)).toBe('anime:al-12');
  });

  it('gives no key to manual / demo rows, other sections, or without a region', () => {
    expect(watchCacheKey('movies', 'manual:abc', 'DE')).toBeNull();
    expect(watchCacheKey('movies', 'demo-movie-alien', 'DE')).toBeNull();
    expect(watchCacheKey('anime', 'demo-anime-monster', 'DE')).toBeNull();
    expect(watchCacheKey('movies', '603', null)).toBeNull();
    expect(watchCacheKey('books', '123', 'DE')).toBeNull();
  });
});

describe('isCacheFresh', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  it('is fresh for 7 days', () => {
    expect(isCacheFresh(new Date(now.getTime() - WATCH_CACHE_TTL_MS + 1000), now)).toBe(true);
    expect(isCacheFresh(new Date(now.getTime() - WATCH_CACHE_TTL_MS), now)).toBe(false);
    expect(isCacheFresh('not a date', now)).toBe(false);
  });
});

describe('your services', () => {
  const p = mapTmdbWatchProviders(watchProviders, 'DE');

  it('matches TMDB offers by id and AniList links by normalised name', () => {
    expect(myStreamOffers(p, [8]).map((o) => o.name)).toEqual(['Netflix']);
    const anime = mapAniListStreaming(anilistLinks);
    expect(myStreamOffers(anime, [283], ['Crunchyroll']).map((o) => o.name)).toEqual(['Crunchyroll']);
    expect(isMyService({ id: null, name: 'Disney+', logo: null, url: null }, [], ['Disney Plus'])).toBe(true);
    expect(normalizeProviderName('Amazon Prime Video')).toBe('amazonprimevideo');
  });

  it('puts your services first in every group, otherwise keeping the order', () => {
    const sorted = mineFirst(p, [35, 2]);
    expect(sorted.stream.map((o) => o.id)).toEqual([35, 119, 8]);
    expect(sorted.rent.map((o) => o.id)).toEqual([2, 10]);
  });
});
