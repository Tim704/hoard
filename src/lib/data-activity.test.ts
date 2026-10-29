// getActivity / getOwnedTitleRef (the title page and the ?open= redirect):
// a title is found only among the logged-in user's own rows, so another
// user's id answers exactly like an unknown one.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const rows: Row[] = [];
const queries: { op: string; args: any }[] = [];
let currentUser: { id: string; username: string } | null = null;

/** findFirst over the fake rows, honouring the id / userId of the where. */
function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userMediaActivity: {
      findFirst: async (args: any) => {
        queries.push({ op: 'findFirst', args });
        const row = rows.find((r) => matches(r, args.where)) ?? null;
        if (!row || !args.select) return row;
        return Object.fromEntries(Object.keys(args.select).map((k) => [k, row[k]]));
      },
    },
    externalLink: { findUnique: async () => null },
    tvSeason: { findMany: async () => [] },
  },
}));
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => currentUser }));
vi.mock('@/lib/data-prefs', () => ({ getPrefs: async () => ({ timeZone: 'UTC', region: null }) }));

const { getActivity, getOwnedTitleRef, ownedActivityWhere } = await import('./data');

function bookRow(id: string, userId: string): Row {
  return {
    id,
    userId,
    category: 'BOOK',
    status: 'CONSUMING',
    rating: 8,
    favorite: false,
    notes: 'n',
    elo: 1200,
    franchise: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    book: { id: `m-${id}`, externalId: `ext-${id}`, title: `Book ${id}`, imageUrl: null, description: null, year: 2001 },
  };
}

beforeEach(() => {
  rows.length = 0;
  queries.length = 0;
  rows.push(bookRow('mine', 'u1'), bookRow('theirs', 'u2'));
  currentUser = { id: 'u1', username: 'demo' };
});

describe('ownedActivityWhere', () => {
  it('always scopes by the user', () => {
    expect(ownedActivityWhere('a', 'u1')).toEqual({ id: 'a', userId: 'u1' });
  });
});

describe('getActivity', () => {
  it('returns the user’s own title, flattened', async () => {
    const a = await getActivity('mine');
    expect(a).toMatchObject({ id: 'mine', category: 'books', status: 'CONSUMING', rating: 8, notes: 'n' });
    expect(a?.media.title).toBe('Book mine');
    expect(a?.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(queries[0].args.where).toEqual({ id: 'mine', userId: 'u1' });
  });
  it('answers someone else’s title like an unknown one', async () => {
    expect(await getActivity('theirs')).toBeNull();
    expect(await getActivity('nope')).toBeNull();
    expect(queries.map((q) => q.args.where)).toEqual([
      { id: 'theirs', userId: 'u1' },
      { id: 'nope', userId: 'u1' },
    ]);
  });
  it('reads nothing when logged out or without an id', async () => {
    currentUser = null;
    expect(await getActivity('mine')).toBeNull();
    currentUser = { id: 'u1', username: 'demo' };
    expect(await getActivity('')).toBeNull();
    expect(queries).toEqual([]);
  });
});

describe('getOwnedTitleRef', () => {
  it('gives the section of the user’s own title only', async () => {
    expect(await getOwnedTitleRef('mine')).toEqual({ id: 'mine', category: 'books' });
    expect(await getOwnedTitleRef('theirs')).toBeNull();
    expect(queries.every((q) => q.args.where.userId === 'u1')).toBe(true);
  });
});
