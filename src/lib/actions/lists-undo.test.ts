// Removing a title from a custom list can be undone: the remove hands back
// what was there, and restoring puts it back at the same place.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const items: Row[] = [];
let currentUser = { id: 'u1', username: 'tim' };
const list = { id: 'l1', ownerId: 'u1', members: [] as Row[] };

vi.mock('@/lib/prisma', () => ({
  prisma: {
    customList: {
      findUnique: async ({ where }: any) => (where.id === list.id ? list : null),
      update: async () => list,
    },
    customListItem: {
      findFirst: async ({ where }: any) => items.find((i) => i.id === where.id && i.listId === where.listId) ?? null,
      findUnique: async ({ where }: any) => {
        const k = where.listId_category_mediaId;
        return items.find((i) => i.listId === k.listId && i.category === k.category && i.mediaId === k.mediaId) ?? null;
      },
      deleteMany: async ({ where }: any) => {
        const before = items.length;
        for (let i = items.length - 1; i >= 0; i--) if (items[i].id === where.id && items[i].listId === where.listId) items.splice(i, 1);
        return { count: before - items.length };
      },
      count: async ({ where }: any) => items.filter((i) => i.listId === where.listId).length,
      create: async ({ data }: any) => {
        const row = { id: `new-${items.length + 1}`, ...data };
        items.push(row);
        return row;
      },
    },
  },
}));
vi.mock('@/lib/session', () => ({ requireUser: async () => currentUser }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const { removeListItem, restoreListItem } = await import('./lists');

beforeEach(() => {
  items.length = 0;
  currentUser = { id: 'u1', username: 'tim' };
  items.push(
    { id: 'i1', listId: 'l1', category: 'books', mediaId: 'b1', addedById: 'u1', position: 1000 },
    { id: 'i2', listId: 'l1', category: 'movies', mediaId: 'm1', addedById: 'u1', position: 2000 },
  );
});

describe('removeListItem → restoreListItem', () => {
  it('hands back what was removed, and Undo puts it back at its place', async () => {
    const res = await removeListItem('l1', 'i1');
    expect(res).toMatchObject({ ok: true, restore: { category: 'books', mediaId: 'b1', position: 1000 } });
    expect(items.map((i) => i.id)).toEqual(['i2']);
    if (!res.ok || !('restore' in res) || !res.restore) throw new Error('no restore');
    expect(await restoreListItem('l1', res.restore)).toEqual({ ok: true });
    expect(items.find((i) => i.mediaId === 'b1')).toMatchObject({ position: 1000, category: 'books' });
  });

  it('refuses a restore from someone who cannot edit the list, or with a bad payload', async () => {
    currentUser = { id: 'u9', username: 'olive' };
    expect((await restoreListItem('l1', { category: 'books', mediaId: 'b1', position: 1000 })).ok).toBe(false);
    currentUser = { id: 'u1', username: 'tim' };
    expect((await restoreListItem('l1', { category: 'nope', mediaId: 'b1', position: 1000 })).ok).toBe(false);
    expect((await restoreListItem('l1', { category: 'books', mediaId: 'b1', position: Infinity })).ok).toBe(false);
  });
});
