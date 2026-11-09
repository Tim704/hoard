// Arena duels answer in the {ok} shape every other action uses, so the page
// can tell "saved, here's the next pair" from "nothing was saved" (a title
// removed in another tab) and from an error page or a dropped connection.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const activities: Row[] = [];
const matchup = { rating: 7, a: { id: 'a' }, b: { id: 'b' } };
let currentUser = { id: 'u1', username: 'tim' };

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userMediaActivity: {
      findUnique: async ({ where }: any) => activities.find((a) => a.id === where.id) ?? null,
      update: ({ where, data }: any) => ({ where, data }),
    },
    $transaction: async (ops: unknown[]) => ops,
  },
}));
vi.mock('@/lib/session', () => ({ requireUser: async () => currentUser }));
vi.mock('@/lib/actions/shared', () => ({ revalidateCategory: () => undefined }));
vi.mock('@/lib/events', () => ({ recordEvent: () => ({}) }));
vi.mock('@/lib/data-prefs', () => ({ getPrefs: async () => ({ titleLanguage: 'english' }) }));
vi.mock('@/lib/data', () => ({
  getMatchup: async () => matchup,
  getChallengeMatchup: async () => matchup,
  getCategoryActivities: async () => [],
}));

const { nextChallenge, nextMatchup, submitChallenge, submitMatchup } = await import('./arena');

beforeEach(() => {
  activities.length = 0;
  currentUser = { id: 'u1', username: 'tim' };
  activities.push(
    { id: 'a', userId: 'u1', elo: 1200, tier: 'S', rankOrder: 1000 },
    { id: 'b', userId: 'u1', elo: 1200, tier: 'S', rankOrder: 2000 },
  );
});

describe('submitMatchup', () => {
  it('saves the duel and hands back the next pair', async () => {
    expect(await submitMatchup('books', 'b', 'a')).toEqual({ ok: true, next: matchup });
  });

  it('says nothing was saved when a title is gone or not mine, instead of an empty arena', async () => {
    activities.splice(1, 1);
    const res = await submitMatchup('books', 'a', 'b');
    expect(res.ok).toBe(false);
    expect(res).toHaveProperty('error');
    activities.push({ id: 'b', userId: 'u2', elo: 1200 });
    expect((await submitMatchup('books', 'a', 'b')).ok).toBe(false);
  });
});

describe('submitChallenge', () => {
  it('saves and hands back the next pair with the history', async () => {
    const res = await submitChallenge('books', 'b', 'a', {});
    expect(res).toMatchObject({ ok: true, next: matchup, suggestion: null });
  });

  it('says nothing was saved when the duel is refused', async () => {
    activities.length = 0;
    expect((await submitChallenge('books', 'a', 'b', {})).ok).toBe(false);
  });
});

describe('nextMatchup and nextChallenge', () => {
  it('answer in the same shape', async () => {
    expect(await nextMatchup('books')).toEqual({ ok: true, next: matchup });
    expect(await nextChallenge('books')).toEqual({ ok: true, next: matchup });
  });
});
