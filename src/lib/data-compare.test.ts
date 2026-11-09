// Compare never tells you a friend's score for a title they recommended to
// you before you've scored it yourself (the Recommendations page hides it
// until the verdict; Compare must not give it away).
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const users: Row[] = [];
const activities: Row[] = [];
const recs: Row[] = [];
const books: Row[] = [];

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: any) => users.find((u) => (where.id ? u.id === where.id : u.username === where.username)) ?? null,
    },
    userMediaActivity: {
      findMany: async ({ where }: any) => activities.filter((a) => a.userId === where.userId),
    },
    recommendation: {
      findMany: async ({ where }: any) => recs.filter((r) => r.fromId === where.fromId && r.toId === where.toId),
    },
    book: { findMany: async ({ where }: any) => books.filter((b) => where.id.in.includes(b.id)) },
  },
}));

const { compareLibraries } = await import('./data-compare');

const book = (id: string, userId: string, bookId: string, rating: number | null) => ({
  id,
  userId,
  category: 'BOOK',
  bookId,
  status: rating == null ? 'PLANNED' : 'COMPLETED',
  rating,
  tier: null,
});

beforeEach(() => {
  users.length = activities.length = recs.length = books.length = 0;
  users.push(
    { id: 'u1', username: 'tim', prefs: { compareOptIn: true } },
    { id: 'u2', username: 'sam', prefs: { compareOptIn: true } },
  );
  books.push({ id: 'b1', externalId: 'ol:1', title: 'Paprika' }, { id: 'b2', externalId: 'ol:2', title: 'Solaris' });
});

describe('compareLibraries: a score sealed until you have your own', () => {
  it('hides their score on a title they recommended to you that you have not scored', async () => {
    activities.push(book('m1', 'u1', 'b1', null), book('t1', 'u2', 'b1', 9), book('m2', 'u1', 'b2', null), book('t2', 'u2', 'b2', 7));
    recs.push({ fromId: 'u2', toId: 'u1', category: 'books', mediaId: 'b1' });
    const view = await compareLibraries('u1', 'sam');
    if (!view.ok) throw new Error('expected a view');
    const paprika = view.shared.find((s) => s.title === 'Paprika');
    const solaris = view.shared.find((s) => s.title === 'Solaris');
    expect(paprika).toMatchObject({ theirRating: null, sealed: true });
    // Not recommended: shown as before.
    expect(solaris).toMatchObject({ theirRating: 7, sealed: false });
  });

  it('shows it once you have scored the title', async () => {
    activities.push(book('m1', 'u1', 'b1', 6), book('t1', 'u2', 'b1', 9));
    recs.push({ fromId: 'u2', toId: 'u1', category: 'books', mediaId: 'b1' });
    const view = await compareLibraries('u1', 'sam');
    if (!view.ok) throw new Error('expected a view');
    expect(view.shared[0]).toMatchObject({ theirRating: 9, sealed: false });
  });
});
