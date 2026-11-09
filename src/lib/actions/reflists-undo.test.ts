// Removing a title from your pasted list can be undone: the remove hands back
// the row, and restoring puts it back at its old place.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const items: Row[] = [];
let currentUser = { id: 'u1', username: 'tim' };
const lists: Row[] = [
  { id: 'r1', userId: 'u1', source: 'custom' },
  { id: 'r2', userId: 'u1', source: 'imdb-top-250' },
];

vi.mock('@/lib/prisma', () => ({
  prisma: {
    refList: { findUnique: async ({ where }: any) => lists.find((l) => l.id === where.id) ?? null },
    refListItem: {
      findFirst: async ({ where }: any) => items.find((i) => i.id === where.id && i.listId === where.listId) ?? null,
      findUnique: async ({ where }: any) => {
        const k = where.listId_externalId;
        return items.find((i) => i.listId === k.listId && i.externalId === k.externalId) ?? null;
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

const { removeRefListItem, restoreRefListItem } = await import('./reflists');

const dune = { category: 'books', externalId: 'ol:1', title: 'Dune', year: 1965, imageUrl: 'https://covers.example/dune.jpg', position: 1 };

beforeEach(() => {
  items.length = 0;
  currentUser = { id: 'u1', username: 'tim' };
  items.push({ id: 'i1', listId: 'r1', ...dune }, { id: 'i2', listId: 'r1', ...dune, externalId: 'ol:2', title: 'Emma', position: 2 });
});

describe('removeRefListItem → restoreRefListItem', () => {
  it('hands back the row, and Undo puts it back at its place', async () => {
    const res = await removeRefListItem('r1', 'i1');
    expect(res).toMatchObject({ ok: true, restore: dune });
    expect(items.map((i) => i.id)).toEqual(['i2']);
    if (!res.ok || !('restore' in res) || !res.restore) throw new Error('no restore');
    expect(await restoreRefListItem('r1', res.restore)).toEqual({ ok: true });
    expect(items.find((i) => i.externalId === 'ol:1')).toMatchObject({ ...dune, listId: 'r1' });
  });

  it('is a no-op when the title is already back (a double tap)', async () => {
    expect(await restoreRefListItem('r1', { ...dune, externalId: 'ol:2' })).toEqual({ ok: true });
    expect(items).toHaveLength(2);
  });

  it('refuses someone else, a built-in list, and a bad payload', async () => {
    currentUser = { id: 'u9', username: 'olive' };
    expect((await restoreRefListItem('r1', dune)).ok).toBe(false);
    currentUser = { id: 'u1', username: 'tim' };
    expect((await restoreRefListItem('r2', dune)).ok).toBe(false);
    expect((await restoreRefListItem('r1', { ...dune, category: 'nope' })).ok).toBe(false);
    expect((await restoreRefListItem('r1', { ...dune, position: Infinity })).ok).toBe(false);
    expect((await restoreRefListItem('r1', { ...dune, imageUrl: 'javascript:alert(1)' })).ok).toBe(false);
    expect((await restoreRefListItem('r1', { ...dune, title: '' })).ok).toBe(false);
    expect(items).toHaveLength(2);
  });
});
