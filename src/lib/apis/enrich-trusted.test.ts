import { describe, expect, it, vi } from 'vitest';

vi.mock('./details', () => ({
  isLookupSkipped: () => false,
  detailsConfigured: () => true,
  fetchDetailPatch: async () => ({ title: 'Hades', igdbRating: 93, steamAppId: 1145360 }),
  splitSeasons: (patch: Record<string, unknown>) => ({ columns: patch, seasons: null }),
}));

const { enrichResult } = await import('./index');

describe('enrichResult: trusted provider columns (re-review 1)', () => {
  it('moves IGDB\'s steamAppId out of `fields` into `trusted`, replacing a client one', async () => {
    const hit = {
      externalId: '113112',
      title: 'Hades',
      imageUrl: null,
      subtitle: null,
      year: 2020,
      description: null,
      fields: { title: 'Hades', steamAppId: 570 },
    };
    const out = await enrichResult('games', hit);
    expect(out.trusted).toEqual({ steamAppId: 1145360 });
    expect(out.result.fields).toMatchObject({ title: 'Hades', igdbRating: 93 });
    // The client's own id is still in `fields`, but the catalogue write drops it.
    expect(out.result.fields.steamAppId).toBe(570);
  });
});
