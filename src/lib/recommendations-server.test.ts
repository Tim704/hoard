// Settling: a recipient's library change turns into ADDED and one verdict
// notification, never twice and never while either switch is off.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const users: Row[] = [];
const activities: Row[] = [];
const recs: Row[] = [];
const books: Row[] = [];
const notifyMock = vi.fn();
let dbDown = false;
let failActivityFor: string | null = null;

const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);

function project(row: Row | null | undefined, select?: Row): Row | null {
  if (!row) return null;
  if (!select) return row;
  const out: Row = {};
  for (const [k, v] of Object.entries(select)) {
    if (k === 'from' || k === 'to') out[k] = project(users.find((u) => u.id === row[`${k}Id`]), (v as Row).select);
    else out[k] = row[k];
  }
  return out;
}

const guard = () => {
  if (dbDown) throw new Error('database is down');
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    book: { findUnique: async ({ where }: any) => books.find((b) => b.id === where.id) ?? null },
    userMediaActivity: {
      findFirst: async ({ where, select }: any) => {
        guard();
        if (where.userId === failActivityFor) throw new Error('one bad row');
        return project(activities.find((a) => matches(a, where)), select);
      },
    },
    recommendation: {
      findMany: async ({ where, select }: any) => {
        guard();
        return recs.filter((r) => matches(r, where)).map((r) => project(r, select));
      },
      updateMany: async ({ where, data }: any) => {
        guard();
        const hits = recs.filter((r) => matches(r, where));
        hits.forEach((r) => Object.assign(r, data));
        return { count: hits.length };
      },
    },
  },
}));
vi.mock('@/lib/notify', () => ({ notify: (...args: unknown[]) => notifyMock(...args) }));

const { settleAllRecommendations, settleRecommendationsForActivity, settleRecommendationsForTitle } = await import(
  './recommendations-server'
);

const SENT_AT = new Date('2026-10-01T00:00:00Z');
const BEFORE = new Date('2026-09-01T00:00:00Z');
const AFTER = new Date('2026-10-02T00:00:00Z');

function rec(extra: Row = {}): Row {
  return {
    id: 'r1',
    fromId: 'u1',
    toId: 'u2',
    category: 'books',
    mediaId: 'b1',
    note: 'SECRET-NOTE',
    guess: 7.25,
    response: 'PENDING',
    createdAt: SENT_AT,
    respondedAt: null,
    verdictNotifiedAt: null,
    ...extra,
  };
}

function theirActivity(extra: Row = {}): Row {
  return {
    id: 'a2',
    userId: 'u2',
    category: 'BOOK',
    bookId: 'b1',
    status: 'PLANNED',
    rating: null,
    createdAt: AFTER,
    ...extra,
  };
}

const settle = () => settleRecommendationsForTitle('u2', 'books', 'b1');
const setOptIn = (id: string, on: boolean) => {
  users.find((u) => u.id === id)!.prefs = { compareOptIn: on };
};

beforeEach(() => {
  users.length = activities.length = recs.length = books.length = 0;
  notifyMock.mockReset();
  notifyMock.mockResolvedValue({ id: 'n', push: { sent: [], error: null } });
  dbDown = false;
  failActivityFor = null;
  users.push(
    { id: 'u1', username: 'tim', prefs: { compareOptIn: true } },
    { id: 'u2', username: 'sam', prefs: { compareOptIn: true } },
  );
  books.push({ id: 'b1', externalId: 'ol:1', title: 'Paprika', titleEnglish: 'Paprika', titleRomaji: 'Papurika' });
});

describe('settleRecommendationsForTitle: ADDED', () => {
  it('marks PENDING as ADDED when the title was added after the recommendation was sent', async () => {
    recs.push(rec());
    activities.push(theirActivity({ createdAt: AFTER }));
    await settle();
    expect(recs[0].response).toBe('ADDED');
    expect(recs[0].respondedAt).toBeInstanceOf(Date);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('counts a title added at the very moment it was sent as added', async () => {
    recs.push(rec());
    activities.push(theirActivity({ createdAt: new Date(SENT_AT) }));
    await settle();
    expect(recs[0].response).toBe('ADDED');
  });

  it('leaves PENDING alone for a title they already had when it was sent', async () => {
    recs.push(rec());
    activities.push(theirActivity({ createdAt: BEFORE }));
    await settle();
    expect(recs[0].response).toBe('PENDING');
    expect(recs[0].respondedAt).toBeNull();
  });

  it('leaves a passed pick passed when they add it later', async () => {
    recs.push(rec({ response: 'PASSED' }));
    activities.push(theirActivity());
    await settle();
    expect(recs[0].response).toBe('PASSED');
  });

  it('does nothing when the title is not in their library', async () => {
    recs.push(rec());
    await settle();
    expect(recs[0].response).toBe('PENDING');
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('only touches the recipient’s rows for that title', async () => {
    recs.push(rec({ id: 'other-title', mediaId: 'b9' }), rec({ id: 'other-person', toId: 'u9', fromId: 'u2' }));
    activities.push(theirActivity({ rating: 8 }));
    await settle();
    expect(recs.every((r) => r.response === 'PENDING' && r.verdictNotifiedAt === null)).toBe(true);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe('settleRecommendationsForTitle: the verdict notification', () => {
  it('notifies the sender once on the first verdict', async () => {
    recs.push(rec());
    activities.push(theirActivity({ rating: 8 }));
    await settle();
    await settle();
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const [to, msg] = notifyMock.mock.calls[0];
    expect(to).toBe('u1');
    expect(msg).toEqual({
      kind: 'friends',
      title: "sam's verdict on Paprika is in",
      body: 'Open Recommendations to see it.',
      url: '/recommendations',
      dedupeKey: 'rec-verdict:r1',
    });
    expect(recs[0].verdictNotifiedAt).toBeInstanceOf(Date);
  });

  it('carries no score, guess or note', async () => {
    recs.push(rec());
    activities.push(theirActivity({ rating: 3.5 }));
    await settle();
    const json = JSON.stringify(notifyMock.mock.calls[0][1]);
    for (const secret of ['3.5', '7.25', 'SECRET-NOTE']) expect(json).not.toContain(secret);
  });

  it('names the title in the sender’s language', async () => {
    users[0].prefs = { compareOptIn: true, titleLanguage: 'romaji' };
    recs.push(rec());
    activities.push(theirActivity({ rating: 8 }));
    await settle();
    expect(notifyMock.mock.calls[0][1].title).toBe("sam's verdict on Papurika is in");
  });

  it('treats dropping it unscored as a verdict', async () => {
    recs.push(rec());
    activities.push(theirActivity({ status: 'DROPPED' }));
    await settle();
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it('does not count a finished title with no title-level score', async () => {
    recs.push(rec());
    activities.push(theirActivity({ status: 'COMPLETED' }));
    await settle();
    expect(notifyMock).not.toHaveBeenCalled();
    expect(recs[0].verdictNotifiedAt).toBeNull();
  });

  it('notifies on a verdict for a pick they had passed', async () => {
    recs.push(rec({ response: 'PASSED' }));
    activities.push(theirActivity({ rating: 2 }));
    await settle();
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(recs[0].response).toBe('PASSED');
  });

  it('does not notify again after clearing and re-scoring', async () => {
    recs.push(rec());
    const theirs = theirActivity({ rating: 8 });
    activities.push(theirs);
    await settle();

    theirs.rating = null;
    await settle();
    theirs.rating = 4;
    await settle();

    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it('notifies once when two settles race for the claim', async () => {
    recs.push(rec());
    activities.push(theirActivity({ rating: 8 }));
    await Promise.all([settle(), settle()]);
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the sender', 'u1'],
    ['the recipient', 'u2'],
  ])('holds the notification while either switch is off, and sends it once back on (%s)', async (_label, id) => {
    recs.push(rec());
    activities.push(theirActivity({ rating: 8 }));

    setOptIn(id, false);
    await settle();
    await settleAllRecommendations();
    expect(notifyMock).not.toHaveBeenCalled();
    expect(recs[0].verdictNotifiedAt).toBeNull();
    expect(recs[0].response).toBe('PENDING');

    setOptIn(id, true);
    await settle();
    await settle();
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(recs[0].response).toBe('ADDED');
  });

  it('claims nothing when the catalogue title is gone', async () => {
    recs.push(rec());
    activities.push(theirActivity({ rating: 8 }));
    books.length = 0;
    await settle();
    expect(notifyMock).not.toHaveBeenCalled();
    expect(recs[0].verdictNotifiedAt).toBeNull();
  });
});

describe('settleRecommendationsForActivity', () => {
  it('finds the title from the activity’s category and foreign key', async () => {
    recs.push(rec());
    activities.push(theirActivity({ rating: 8 }));
    await settleRecommendationsForActivity('u2', { category: 'BOOK', bookId: 'b1' });
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it('ignores an activity with no usable category or key', async () => {
    recs.push(rec());
    activities.push(theirActivity({ rating: 8 }));
    await settleRecommendationsForActivity('u2', { category: 'NOPE', bookId: 'b1' });
    await settleRecommendationsForActivity('u2', { category: 'BOOK', bookId: null });
    await settleRecommendationsForActivity('u2', { category: 'BOOK' });
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe('failures', () => {
  it('never throws when the database fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    recs.push(rec());
    dbDown = true;
    await expect(settle()).resolves.toBeUndefined();
    await expect(settleRecommendationsForActivity('u2', { category: 'BOOK', bookId: 'b1' })).resolves.toBeUndefined();
    expect(notifyMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('settleAll carries on past one bad row', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    users.push({ id: 'u3', username: 'bad', prefs: { compareOptIn: true } });
    recs.push(rec({ id: 'r-bad', toId: 'u3' }), rec());
    activities.push(theirActivity({ rating: 8 }));
    failActivityFor = 'u3';
    expect(await settleAllRecommendations()).toEqual({ checked: 2, notified: 1 });
    spy.mockRestore();
  });
});
