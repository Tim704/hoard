// The C1 exploit, end to end through the add path: a client-sent hit whose
// `fields` carry nested relation writes must create nothing for anyone else.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { model: string; op: string; args: any };
const calls: Call[] = [];
let stored: Record<string, any> | null = null;

function model(name: string) {
  const rec = (op: string, result: (args: any) => any) => async (args: any) => {
    calls.push({ model: name, op, args });
    return result(args);
  };
  return {
    findUnique: rec('findUnique', () => stored),
    findFirst: rec('findFirst', () => null),
    upsert: rec('upsert', (a) => ({ id: 'media1', ...a.create })),
    update: rec('update', (a) => ({ ...stored, ...a.data })),
    create: rec('create', (a) => ({ id: name === 'userMediaActivity' ? 'act1' : 'x', ...a.data })),
    createMany: rec('createMany', () => ({ count: 0 })),
    aggregate: rec('aggregate', () => ({ _max: { queueOrder: null } })),
  };
}
const tx: Record<string, any> = Object.fromEntries(
  ['movie', 'tvShow', 'book', 'anime', 'videoGame', 'userMediaActivity', 'activityEvent', 'diaryEntry', 'tvSeason'].map((m) => [m, model(m)]),
);

vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: (cb: (t: unknown) => unknown) => cb(tx) } }));
vi.mock('@/lib/data-prefs', () => ({ getPrefs: async () => ({ timeZone: 'UTC' }) }));
vi.mock('@/lib/franchise/auto', () => ({ autoGroupAfterAdd: async () => {} }));
vi.mock('@/lib/library/seen-seasons', () => ({ seenSeasonCountNow: async () => 1, userToday: async () => '2026-10-28' }));
vi.mock('@/lib/library/tv-seasons', () => ({ saveTvSeasons: async () => {} }));

const { addMediaForUser, upsertCatalogueRow } = await import('./add');

const attack = {
  externalId: '550',
  title: 'Fight Club',
  imageUrl: null,
  subtitle: null,
  year: 1999,
  description: null,
  fields: {
    title: 'Fight Club',
    activities: { create: [{ userId: 'victim', category: 'MOVIE', status: 'COMPLETED' }] },
    seasons: { create: [{ number: 1 }] },
    user: { connect: { id: 'victim' } },
    connect: { id: 'victim' },
  } as Record<string, unknown>,
};

const hasRelationKey = (o: Record<string, unknown>) =>
  ['activities', 'seasons', 'user', 'connect'].some((k) => k in o);

beforeEach(() => {
  calls.length = 0;
  stored = null;
});

describe('C1: nested writes through the add path', () => {
  it('a new row: relation keys are dropped from the create, only the caller gets an activity', async () => {
    await addMediaForUser('attacker', 'movies', attack, { status: 'COMPLETED' });
    const upsert = calls.find((c) => c.model === 'movie' && c.op === 'upsert')!;
    expect(upsert.args.create).toEqual({ externalId: '550', title: 'Fight Club' });
    expect(upsert.args.update).toEqual({});
    const created = calls.filter((c) => c.model === 'userMediaActivity' && c.op === 'create');
    expect(created).toHaveLength(1);
    expect(created[0].args.data.userId).toBe('attacker');
    // Nothing anywhere mentions the victim.
    expect(JSON.stringify(calls)).not.toContain('victim');
  });

  it('an existing row: the fill-only update carries no relation keys', async () => {
    stored = { id: 'media1', externalId: '550', title: 'Fight Club', description: null, activities: null };
    await upsertCatalogueRow(tx as never, 'movies', { ...attack, fields: { ...attack.fields, description: 'Soap.' } }, null);
    const update = calls.find((c) => c.model === 'movie' && c.op === 'update')!;
    expect(update.args.data).toEqual({ description: 'Soap.' });
    expect(hasRelationKey(update.args.data)).toBe(false);
    expect(JSON.stringify(calls)).not.toContain('victim');
  });

  it('TV: a forged `seasons` relation never reaches the show row', async () => {
    await upsertCatalogueRow(tx as never, 'tv', { ...attack, externalId: '1399' }, null);
    const upsert = calls.find((c) => c.model === 'tvShow' && c.op === 'upsert')!;
    expect(hasRelationKey(upsert.args.create)).toBe(false);
  });

  it('adding as done writes no diary entry (the watch date is unknown)', async () => {
    await addMediaForUser('attacker', 'movies', { ...attack, fields: { title: 'Fight Club' } }, { status: 'COMPLETED' });
    expect(calls.some((c) => c.model === 'diaryEntry')).toBe(false);
  });

  it('steamAppId: the client\'s is dropped, the enrichment-provided one lands (re-review 1)', async () => {
    const game = { ...attack, externalId: '113112', fields: { title: 'Hades', steamAppId: 570 } };
    await addMediaForUser('attacker', 'games', game, { status: 'PLANNED' });
    expect(calls.find((c) => c.model === 'videoGame' && c.op === 'upsert')!.args.create).toEqual({ externalId: '113112', title: 'Hades' });
    calls.length = 0;
    await addMediaForUser('attacker', 'games', { ...game, externalId: '113113' }, { status: 'PLANNED', trusted: { steamAppId: 1145360 } });
    expect(calls.find((c) => c.model === 'videoGame' && c.op === 'upsert')!.args.create).toMatchObject({ steamAppId: 1145360 });
  });
});
