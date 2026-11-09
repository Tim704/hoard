// An anime or manga added before AniList knew its MyAnimeList id is stored as
// `al-<AniList id>`. Once AniList links the MAL id, search and links return
// the MAL id: adding it again must find the old row (and move it to the MAL
// key), not create a second title.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = new Map<string, Record<string, any>>();
const calls: { op: string; args: any }[] = [];

const anime = {
  findUnique: async (args: any) => {
    calls.push({ op: 'findUnique', args });
    return rows.get(args.where.externalId) ?? null;
  },
  upsert: async (args: any) => {
    calls.push({ op: 'upsert', args });
    const row = { id: `new-${args.where.externalId}`, ...args.create };
    rows.set(args.where.externalId, row);
    return row;
  },
  update: async (args: any) => {
    calls.push({ op: 'update', args });
    const row = [...rows.values()].find((r) => r.id === args.where.id)!;
    const next = { ...row, ...args.data };
    for (const [k, v] of rows) if (v.id === row.id) rows.delete(k);
    rows.set(next.externalId, next);
    return next;
  },
};
const tx = { anime };

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

const { upsertCatalogueRow } = await import('./add');

const hit = (externalId: string, anilistId?: string) => ({
  externalId,
  title: 'Witch Watch',
  imageUrl: null,
  subtitle: null,
  year: 2025,
  description: null,
  fields: { title: 'Witch Watch', ...(anilistId ? { anilistId } : {}) },
});

beforeEach(() => {
  rows.clear();
  calls.length = 0;
});

describe('upsertCatalogueRow: an al- row meets its MAL id', () => {
  it('reuses the al- row and moves it to the MAL key, instead of creating a second title', async () => {
    rows.set('al-170000', { id: 'row1', externalId: 'al-170000', title: 'Witch Watch' });
    const media = await upsertCatalogueRow(tx as never, 'anime', hit('59000', '170000'), null);
    expect(media.id).toBe('row1');
    expect(media.externalId).toBe('59000');
    expect(calls.some((c) => c.op === 'upsert')).toBe(false);
  });

  it('creates a row as before when there is no al- row, and never sends anilistId as a column', async () => {
    const media = await upsertCatalogueRow(tx as never, 'anime', hit('59000', '170000'), null);
    expect(media.id).toBe('new-59000');
    const upsert = calls.find((c) => c.op === 'upsert')!;
    expect(upsert.args.create).not.toHaveProperty('anilistId');
  });
});
