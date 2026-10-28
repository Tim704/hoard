import { describe, expect, it } from 'vitest';

import { apiActivity, apiQueue, apiTiers } from './api-shape';
import { makeActivity } from './test-fixtures';
import { buildTierBoard } from './tiers';

describe('api shapes', () => {
  it('expose an allowlist of fields, never Elo or internal order numbers', () => {
    const a = makeActivity({
      id: 'a1',
      rating: 8,
      tier: 'S',
      rankOrder: 1000,
      queueOrder: 3000,
      elo: 1337,
      notes: 'mine',
      media: { id: 'm1', externalId: '603', title: 'The Matrix', imageUrl: null, description: 'x', year: 1999, genres: ['Action', 3], secretish: 'no' },
    });
    const out = apiActivity(a, { startedAt: new Date('2026-01-01T00:00:00Z'), finishedAt: null });
    expect(out).toMatchObject({ id: 'a1', score: 8, tier: 'S', notes: 'mine', startedAt: '2026-01-01T00:00:00.000Z', finishedAt: null });
    expect(out.media).toEqual({
      externalId: '603',
      title: 'The Matrix',
      titleEnglish: null,
      titleRomaji: null,
      titleNative: null,
      year: 1999,
      releaseDate: null,
      imageUrl: null,
      genres: ['Action'],
    });
    const text = JSON.stringify(out);
    for (const leak of ['elo', '1337', 'rankOrder', 'queueOrder', 'secretish', 'userId']) expect(text).not.toContain(leak);
  });

  it('number tier and queue places from 1', () => {
    const items = [
      makeActivity({ id: 'b', tier: 'S', rankOrder: 2 }),
      makeActivity({ id: 'a', tier: 'S', rankOrder: 1 }),
      makeActivity({ id: 'c', tier: null }),
    ];
    const tiers = apiTiers('movies', buildTierBoard(items));
    expect(tiers.tiers.S.map((x) => [x.id, x.position])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect(tiers.unranked.map((x) => x.id)).toEqual(['c']);
    expect(Object.keys(tiers.tiers)).toEqual(['S', 'A', 'B', 'C', 'D', 'F']);
    expect(apiQueue('books', items).items.map((x) => x.position)).toEqual([1, 2, 3]);
  });
});
