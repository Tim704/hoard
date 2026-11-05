// The wiring only: the actions that change a score or add a title call the
// recommendations settle helper after the write, never for a favourite- or
// notes-only edit, and a failing settle can't fail the save.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const settleForActivity = vi.fn(async (..._args: unknown[]) => undefined);
const settleForTitle = vi.fn(async (..._args: unknown[]) => undefined);
const order: string[] = [];
const activity = {
  id: 'a1',
  userId: 'u1',
  category: 'BOOK',
  bookId: 'b1',
  status: 'PLANNED',
  rating: null as number | null,
  finishedAt: null,
  favorite: false,
  notes: null,
};

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userMediaActivity: {
      findUnique: async () => ({ ...activity }),
      update: async () => {
        order.push('update');
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const out = await fn({
        userMediaActivity: { update: async () => order.push('update') },
      });
      order.push('commit');
      return out;
    },
  },
}));
vi.mock('@/lib/session', () => ({ requireUser: async () => ({ id: 'u1', username: 'tim' }) }));
vi.mock('@/lib/apis', () => ({
  searchProvider: async () => ({}),
  enrichResult: async (_slug: string, result: unknown) => ({ result, metaFetchedAt: null, seasons: null, trusted: {} }),
}));
vi.mock('@/lib/library/add', () => ({
  addMediaForUser: vi.fn(async () => ({ activityId: 'a9', existing: false, mediaId: 'b9' })),
  newManualExternalId: () => 'manual:x',
}));
vi.mock('@/lib/library/seen-seasons', () => ({ seenSeasonCountNow: async () => 0, userToday: async () => '2026-11-05' }));
vi.mock('@/lib/actions/shared', () => ({
  appendQueueOrder: async () => 1,
  revalidateCategory: () => undefined,
}));
vi.mock('@/lib/anilist-sync-server', () => ({ queueAniListPush: () => undefined }));
vi.mock('@/lib/events', () => ({
  eventsForUpdate: () => [],
  recordEvent: async () => undefined,
  recordEvents: async () => undefined,
}));
vi.mock('@/lib/data-prefs', () => ({ getPrefs: async () => ({}) }));
vi.mock('@/lib/diary', () => ({
  touchesDiary: () => false,
  applyDiaryForUpdate: async () => ({ diaryEntryId: undefined }),
  undoDiaryForRestore: async () => undefined,
}));
vi.mock('@/lib/rate-limit', () => ({ takeActionRate: () => true }));
vi.mock('@/lib/undo-store', () => ({ undoStore: { get: () => null, drop: () => undefined, put: () => 't' } }));
vi.mock('@/lib/recommendations-server', () => ({
  settleRecommendationsForActivity: (...args: unknown[]) => {
    order.push('settle');
    return settleForActivity(...args);
  },
  settleRecommendationsForTitle: (...args: unknown[]) => {
    order.push('settle');
    return settleForTitle(...args);
  },
}));

const { addToList, updateActivity } = await import('./media');

beforeEach(() => {
  settleForActivity.mockClear();
  settleForTitle.mockClear();
  order.length = 0;
  activity.status = 'PLANNED';
  activity.rating = null;
});

describe('updateActivity settles recommendations', () => {
  it('after the commit, when the score changes', async () => {
    const res = await updateActivity('a1', { rating: 8 });
    expect(res.ok).toBe(true);
    expect(settleForActivity).toHaveBeenCalledTimes(1);
    expect(settleForActivity.mock.calls[0][0]).toBe('u1');
    expect(settleForActivity.mock.calls[0][1]).toMatchObject({ category: 'BOOK', bookId: 'b1' });
    expect(order.indexOf('settle')).toBeGreaterThan(order.indexOf('commit'));
  });

  it('when the status changes', async () => {
    await updateActivity('a1', { status: 'DROPPED' });
    expect(settleForActivity).toHaveBeenCalledTimes(1);
  });

  it('not for a favourite- or notes-only change', async () => {
    await updateActivity('a1', { favorite: true });
    await updateActivity('a1', { notes: 'hello' });
    expect(settleForActivity).not.toHaveBeenCalled();
  });

});

describe('addToList settles recommendations', () => {
  const hit = {
    externalId: 'ol-1',
    title: 'A Book',
    imageUrl: null,
    subtitle: null,
    description: null,
    year: 2001,
    fields: {},
  };

  it('for a newly added title, by its catalogue id', async () => {
    const res = await addToList('books', hit as any, 'PLANNED');
    expect(res.ok).toBe(true);
    expect(settleForTitle).toHaveBeenCalledWith('u1', 'books', 'b9');
  });

  it('not when the title was already in the library', async () => {
    const add = await import('@/lib/library/add');
    vi.mocked(add.addMediaForUser).mockResolvedValueOnce({ activityId: 'a1', existing: true, mediaId: 'b9' });
    await addToList('books', hit as any, 'PLANNED');
    expect(settleForTitle).not.toHaveBeenCalled();
  });
});
