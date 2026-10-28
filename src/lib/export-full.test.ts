import { describe, expect, it } from 'vitest';

import { scrubLinkData, shapeFullExport, type FullExportInput } from './export-full';
import { parsePrefs } from './prefs';

const at = new Date('2026-10-28T10:00:00Z');

function input(over: Partial<FullExportInput> = {}): FullExportInput {
  return {
    user: { username: 'demo', createdAt: at },
    prefs: parsePrefs({ calendarToken: 'cal-secret', notify: { ntfyUrl: 'https://ntfy.sh/secret-topic' } }),
    activities: [{ id: 'a1', userId: 'u1', section: 'books', notes: 'mine', media: { title: 'Dune' } }],
    events: [{ id: 'e1', userId: 'u1', kind: 'added' }],
    franchises: [{ id: 'f1', userId: 'u1', name: 'Dune' }],
    diaryEntries: [{ id: 'd1', userId: 'u1', activityId: 'a1', date: '2026-10-01', review: 'Great' }],
    playSessions: [{ id: 'p1', userId: 'u1', activityId: 'a1', date: '2026-10-02', minutes: 90 }],
    seasonActivities: [
      { id: 's1', userId: 'u1', activityId: 'a1', seasonId: 'tv1', rating: 8, season: { id: 'tv1', tvShowId: 'x', seasonNumber: 2, name: 'Season 2', episodeCount: 10 } },
    ],
    yearDuelScores: [{ id: 'y1', userId: 'u1', activityId: 'a1', year: 2026, elo: 1210, duels: 1 }],
    customLists: [
      {
        id: 'l1',
        ownerId: 'u1',
        name: 'Comfort',
        items: [{ id: 'i1', listId: 'l1', category: 'books', mediaId: 'm1', addedById: 'u2', addedBy: 'friend', title: 'Dune', position: 1 }],
        members: [{ id: 'mm1', listId: 'l1', userId: 'u2', canEdit: true, username: 'friend' }],
      },
    ],
    refLists: [{ id: 'r1', userId: 'u1', name: 'Top', items: [{ id: 'ri1', listId: 'r1', title: 'Alien', position: 1 }] }],
    goals: [{ id: 'g1', userId: 'u1', year: 2026, metric: 'count', target: 50 }],
    savedViews: [{ id: 'v1', userId: 'u1', name: 'Short films', query: { sections: ['movies'] } }],
    apiTokens: [{ id: 't1', userId: 'u1', name: 'Script', tokenHash: 'abc123', createdAt: at, lastUsedAt: null }],
    externalLinks: [
      { id: 'x1', userId: 'u1', provider: 'anilist', accountId: 'me', token: 'sealed-oauth', data: { lastSyncAt: 'x', accessToken: 'leak', refresh_token: 'leak', apiKey: 'leak', suggested: ['a1'] }, updatedAt: at },
    ],
    tasteProfile: { userId: 'u1', data: { v: 1 }, updatedAt: at },
    shareLinks: [{ id: 'share-token-secret', userId: 'u1', kind: 'tiers', target: 'books', createdAt: at, revokedAt: null }],
    ...over,
  };
}

describe('shapeFullExport', () => {
  const out = shapeFullExport(input(), at);
  const text = JSON.stringify(out);

  it('includes everything the user owns', () => {
    expect(out.format).toBe('hoard-export');
    expect(out.activities).toHaveLength(1);
    expect(out.diaryEntries[0]).toMatchObject({ date: '2026-10-01', review: 'Great' });
    expect(out.playSessions[0]).toMatchObject({ minutes: 90 });
    expect(out.seasonActivities[0]).toMatchObject({ rating: 8, season: { seasonNumber: 2, name: 'Season 2' } });
    expect(out.yearDuelScores[0]).toMatchObject({ year: 2026, elo: 1210 });
    expect(out.customLists[0]).toMatchObject({ name: 'Comfort', items: [{ title: 'Dune', addedBy: 'friend' }], members: [{ username: 'friend', canEdit: true }] });
    expect(out.refLists[0].items[0]).toMatchObject({ title: 'Alien' });
    expect(out.goals[0]).toMatchObject({ target: 50 });
    expect(out.savedViews[0]).toMatchObject({ name: 'Short films' });
    expect(out.apiTokens).toEqual([{ name: 'Script', createdAt: at, lastUsedAt: null }]);
    expect(out.externalLinks[0]).toMatchObject({ provider: 'anilist', accountId: 'me', data: { lastSyncAt: 'x', suggested: ['a1'] } });
    expect(out.tasteProfile).toEqual({ data: { v: 1 }, updatedAt: at });
    expect(out.shareLinks).toEqual([{ kind: 'tiers', target: 'books', createdAt: at, revokedAt: null }]);
  });

  it('never carries hashes, tokens, share ids, user ids or push targets', () => {
    for (const leak of ['abc123', 'sealed-oauth', 'leak', 'share-token-secret', 'cal-secret', 'secret-topic', '"u1"', '"u2"', 'tokenHash']) {
      expect(text).not.toContain(leak);
    }
  });

  it('copes with an empty account', () => {
    const empty = shapeFullExport(
      input({
        activities: [],
        customLists: [],
        refLists: [],
        apiTokens: [],
        externalLinks: [],
        tasteProfile: null,
        shareLinks: [],
      }),
      at,
    );
    expect(empty.tasteProfile).toBeNull();
    expect(empty.customLists).toEqual([]);
  });
});

describe('scrubLinkData', () => {
  it('drops credential-like keys and passes non-objects through', () => {
    expect(scrubLinkData({ name: 'x', token: 't', clientSecret: 's', sessionKey: 'k' })).toEqual({ name: 'x' });
    expect(scrubLinkData(null)).toBeNull();
    expect(scrubLinkData(['a'])).toEqual(['a']);
  });
});
