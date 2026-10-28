import { describe, expect, it } from 'vitest';

import { mapAlbumUserPlays, lastfmUserName } from './apis/music';
import { suggestedIds, suggestsListened, withSuggested } from './lastfm-suggest';

describe('the Last.fm 80 % rule', () => {
  it('suggests at 80 % of the tracks and above', () => {
    expect(suggestsListened(8, 10)).toBe(true);
    expect(suggestsListened(25, 10)).toBe(true);
    expect(suggestsListened(7, 10)).toBe(false);
    // 0.8 × 12 = 9.6: 9 plays isn't enough, 10 is.
    expect(suggestsListened(9, 12)).toBe(false);
    expect(suggestsListened(10, 12)).toBe(true);
  });

  it('needs a known track count and some plays', () => {
    expect(suggestsListened(50, null)).toBe(false);
    expect(suggestsListened(50, 0)).toBe(false);
    expect(suggestsListened(0, 10)).toBe(false);
    expect(suggestsListened(null, 10)).toBe(false);
  });
});

describe('Last.fm JSON', () => {
  it('reads userplaycount (number or string) and the track count', () => {
    const album = { tracks: { track: [{}, {}, {}, {}, {}] } };
    expect(mapAlbumUserPlays({ album: { ...album, userplaycount: 4 } } as any)).toEqual({ userPlays: 4, trackCount: 5 });
    expect(mapAlbumUserPlays({ album: { ...album, userplaycount: '12' } } as any)).toEqual({ userPlays: 12, trackCount: 5 });
    expect(mapAlbumUserPlays({ album: { ...album } } as any)).toEqual({ userPlays: 0, trackCount: 5 });
    expect(mapAlbumUserPlays({ error: 6, message: 'Album not found' })).toBeNull();
    expect(() => mapAlbumUserPlays({ error: 29, message: 'Rate limit' })).toThrow(/29/);
  });

  it('validates a user', () => {
    expect(lastfmUserName({ user: { name: 'RJ' } })).toBe('RJ');
    expect(lastfmUserName({ error: 6, message: 'User not found' })).toBeNull();
    expect(() => lastfmUserName({ error: 11 })).toThrow();
  });
});

describe('suggestions storage', () => {
  it('adds, removes and keeps other keys', () => {
    const data = withSuggested({ other: 1, suggested: ['a'] }, ['b', 'a'], []);
    expect(data).toEqual({ other: 1, suggested: ['a', 'b'] });
    expect(withSuggested(data, [], ['a'])).toEqual({ other: 1, suggested: ['b'] });
    expect(suggestedIds(null)).toEqual([]);
    expect(suggestedIds({ suggested: ['x', 3, '', 'x'] })).toEqual(['x']);
  });
});
