import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('@/lib/prisma', () => ({ prisma: { notification: { create: (...a: unknown[]) => create(...a), update: vi.fn() } } }));
vi.mock('@/lib/data-prefs', () => ({
  getPrefs: async () => ({ notify: { ntfyUrl: null, discordWebhook: null, kinds: [] } }),
}));

const { notify } = await import('@/lib/notify');

const p2002 = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

describe('notify dedupe', () => {
  beforeEach(() => create.mockReset());

  it('stores the dedupe key with the row', async () => {
    create.mockResolvedValueOnce({ id: 'n1' });
    const res = await notify('u1', { kind: 'releases', title: 'T', body: 'B', dedupeKey: 'release:a:2026-10-28' });
    expect(res).toMatchObject({ id: 'n1' });
    expect(create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', dedupeKey: 'release:a:2026-10-28' });
  });
  it('reports a duplicate (and sends nothing) when the unique index rejects the key', async () => {
    create.mockRejectedValueOnce(p2002());
    const res = await notify('u1', { kind: 'releases', title: 'T', body: 'B', dedupeKey: 'release:a:2026-10-28' });
    expect(res).toEqual({ id: null, push: { sent: [], error: null }, duplicate: true });
  });
  it('a unique error without a key is a normal failure, never thrown', async () => {
    create.mockRejectedValueOnce(p2002());
    const res = await notify('u1', { kind: 'test', title: 'T', body: 'B' });
    expect(res.id).toBeNull();
    expect(res.duplicate).toBeUndefined();
    expect(res.push.error).toBeTruthy();
  });
});
