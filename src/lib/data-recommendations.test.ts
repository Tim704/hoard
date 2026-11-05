// What each person may see of a recommendation. The recipient's status and
// score reach the sender only through `waiting` or a verdict, the guess never
// reaches the recipient before a verdict, and either switch hides everything.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const users: Row[] = [];
const activities: Row[] = [];
const recs: Row[] = [];
const media: Record<string, Row[]> = { book: [], anime: [] };
const activityReads: { where: any; select: any }[] = [];

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
    return row[k] === v;
  });

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

const catalogue = (name: string) => ({
  findMany: async ({ where }: any) => media[name].filter((m) => where.id.in.includes(m.id)),
  findUnique: async ({ where }: any) => media[name].find((m) => m.id === where.id) ?? null,
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: async ({ where, select }: any) => project(users.find((u) => matches(u, where)), select),
      findMany: async ({ where, select }: any) =>
        users.filter((u) => u.id !== where.id.not && u.prefs?.compareOptIn === true).map((u) => project(u, select)),
    },
    book: catalogue('book'),
    anime: catalogue('anime'),
    userMediaActivity: {
      findMany: async ({ where, select }: any) => {
        activityReads.push({ where, select });
        return activities.filter((a) => matches(a, where)).map((a) => project(a, select));
      },
      findFirst: async ({ where, select }: any) => {
        activityReads.push({ where, select });
        return project(activities.find((a) => matches(a, where)), select);
      },
    },
    recommendation: {
      findMany: async ({ where, select }: any) =>
        recs
          .filter((r) => matches(r, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((r) => project(r, select)),
      updateMany: async ({ where, data }: any) => {
        const hits = recs.filter((r) => matches(r, where));
        hits.forEach((r) => Object.assign(r, data));
        return { count: hits.length };
      },
    },
  },
}));
vi.mock('@/lib/notify', () => ({ notify: async () => ({ id: 'n', push: { sent: [], error: null } }) }));

const { getRecommendationsPage, getRecommendContext } = await import('./data-recommendations');
const { settleRecommendationsForTitle } = await import('./recommendations-server');

const SENT_AT = new Date('2026-10-01T00:00:00Z');

function activity(id: string, userId: string, bookId: string, extra: Row = {}): Row {
  return {
    id,
    userId,
    category: 'BOOK',
    bookId,
    status: 'PLANNED',
    rating: null,
    tier: null,
    notes: 'PRIVATE-NOTES',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    ...extra,
  };
}

function rec(id: string, fromId: string, toId: string, mediaId: string, extra: Row = {}): Row {
  return {
    id,
    fromId,
    toId,
    category: 'books',
    mediaId,
    note: null,
    guess: null,
    response: 'PENDING',
    createdAt: SENT_AT,
    respondedAt: null,
    verdictNotifiedAt: null,
    ...extra,
  };
}

async function page(meId = 'u1') {
  const p = await getRecommendationsPage(meId);
  if (!p.ok) throw new Error(`expected a page, got ${p.reason}`);
  return p;
}

beforeEach(() => {
  users.length = activities.length = recs.length = activityReads.length = 0;
  media.book.length = media.anime.length = 0;
  users.push(
    { id: 'u1', username: 'tim', prefs: { compareOptIn: true } },
    { id: 'u2', username: 'sam', prefs: { compareOptIn: true } },
    { id: 'u3', username: 'olive', prefs: { compareOptIn: false } },
  );
  media.book.push(
    { id: 'b1', externalId: 'ol:1', title: 'Paprika', imageUrl: 'p.jpg', year: 2006, description: 'blurb' },
    { id: 'b2', externalId: 'ol:2', title: 'Solaris', imageUrl: null, year: 1961 },
  );
  media.anime.push({
    id: 'an1',
    externalId: 'al:1',
    title: 'Mushishi',
    titleEnglish: 'Mushi-Shi',
    titleRomaji: 'Mushishi',
    titleNative: '蟲師',
    imageUrl: null,
    year: 2005,
  });
});

describe('getRecommendationsPage: the guess', () => {
  it('hides the guess from the recipient until a verdict, then shows it', async () => {
    recs.push(rec('r1', 'u2', 'u1', 'b1', { guess: 7.25, note: 'try it' }));
    activities.push(activity('mine', 'u1', 'b1'));

    const before = await page();
    expect(before.inbox).toHaveLength(1);
    expect(before.inbox[0].verdict).toBeNull();
    expect(JSON.stringify(before)).not.toContain('7.25');

    activities[0].rating = 9;
    const after = await page();
    expect(after.inbox).toEqual([]);
    expect(after.received[0].verdict).toMatchObject({ kind: 'scored', recipientScore: 9, guess: 7.25 });
  });

  it('does not read the sender’s library until a verdict', async () => {
    recs.push(rec('r1', 'u2', 'u1', 'b1', { guess: 7 }));
    activities.push(activity('mine', 'u1', 'b1'), activity('theirs', 'u2', 'b1', { rating: 8 }));
    const p = await page();
    expect(p.inbox[0].verdict).toBeNull();
    expect(JSON.stringify(activityReads.map((q) => q.where))).not.toContain('u2');
  });
});

describe('getRecommendationsPage: what the sender sees before a verdict', () => {
  it('never puts the recipient’s rating or status in a view before a verdict except through `waiting`', async () => {
    recs.push(rec('r1', 'u1', 'u2', 'b1', { guess: 4 }));
    activities.push(activity('THEIR-ACTIVITY', 'u2', 'b1', { status: 'CONSUMING', tier: 'S' }));

    const p = await page();
    const view = p.sent[0];
    expect(view.verdict).toBeNull();
    expect(view.waiting).toBe('Reading');
    expect(view.myActivityId).toBeNull();
    const json = JSON.stringify(p);
    expect(json).not.toContain('CONSUMING');
    expect(json).not.toContain('PRIVATE-NOTES');
    expect(json).not.toContain('THEIR-ACTIVITY');
    expect(view).not.toHaveProperty('status');
    expect(view).not.toHaveProperty('rating');
  });

  it('reads the other person’s activity with catalogue key, status and rating only', async () => {
    recs.push(rec('r1', 'u1', 'u2', 'b1'), rec('r2', 'u2', 'u1', 'b2'));
    activities.push(activity('theirs', 'u2', 'b1', { rating: 5 }), activity('mine', 'u1', 'b2', { rating: 5 }));
    await page();
    const theirReads = activityReads.filter((q) => JSON.stringify(q.where).includes('u2'));
    expect(theirReads.length).toBeGreaterThan(0);
    for (const q of theirReads) {
      for (const field of ['id', 'notes', 'tier', 'startedAt', 'finishedAt', 'createdAt', 'tags', 'favorite']) {
        expect(q.select).not.toHaveProperty(field);
      }
      expect(q.select).toMatchObject({ status: true, rating: true });
    }
  });

  it('calls a finished, unscored title Finished, not scored yet', async () => {
    recs.push(rec('r1', 'u1', 'u2', 'b1'));
    activities.push(activity('theirs', 'u2', 'b1', { status: 'COMPLETED' }));
    expect((await page()).sent[0].waiting).toBe('Finished, not scored yet');
  });

  it('offers Withdraw to the sender only, and only while nothing has happened', async () => {
    recs.push(
      rec('r1', 'u1', 'u2', 'b1'),
      rec('r2', 'u1', 'u2', 'b2', { response: 'ADDED' }),
      rec('r3', 'u2', 'u1', 'b1'),
    );
    const p = await page();
    expect(Object.fromEntries(p.sent.map((v) => [v.id, v.withdrawable]))).toEqual({ r1: true, r2: false });
    expect(p.inbox[0].withdrawable).toBe(false);
  });
});

describe('getRecommendationsPage: verdicts', () => {
  it('shows both scores once there is a verdict, even if the viewer has not scored', async () => {
    recs.push(rec('r1', 'u1', 'u2', 'b1', { guess: 8 }), rec('r2', 'u2', 'u1', 'b2', { guess: 3 }));
    activities.push(
      // The viewer sent r1 and hasn't scored it.
      activity('mine1', 'u1', 'b1'),
      activity('theirs1', 'u2', 'b1', { rating: 6 }),
      // The viewer received r2 and dropped it unscored; the sender scored it.
      activity('mine2', 'u1', 'b2', { status: 'DROPPED' }),
      activity('theirs2', 'u2', 'b2', { rating: 9 }),
    );
    const p = await page();
    expect(p.sent[0].verdict).toEqual({ kind: 'scored', recipientScore: 6, guess: 8, senderScore: null });
    expect(p.sent[0].waiting).toBeNull();
    expect(p.received[0].verdict).toEqual({ kind: 'dropped', recipientScore: null, guess: 3, senderScore: 9 });
    expect(p.received[0].myActivityId).toBe('mine2');
  });

  it('leaves senderScore null when the sender removed the title or never scored it', async () => {
    recs.push(rec('r1', 'u2', 'u1', 'b1'), rec('r2', 'u2', 'u1', 'b2'));
    activities.push(
      activity('mine1', 'u1', 'b1', { rating: 5 }),
      activity('mine2', 'u1', 'b2', { rating: 6 }),
      activity('theirs2', 'u2', 'b2', { rating: null }),
    );
    const p = await page();
    for (const view of p.received) expect(view.verdict?.senderScore).toBeNull();
  });

  it('applies a verdict to a passed pick, which still counts as passed', async () => {
    recs.push(rec('r1', 'u1', 'u2', 'b1', { response: 'PASSED', guess: 8 }));
    activities.push(activity('theirs', 'u2', 'b1', { rating: 4 }));
    const p = await page();
    expect(p.sent[0].verdict).toMatchObject({ recipientScore: 4, guess: 8 });
    expect(p.mine).toMatchObject({ passed: 1, averageScore: 4, averageGuessMiss: 4 });
  });

  it('loses the verdict when the score is cleared, and returns with the new score', async () => {
    recs.push(rec('r1', 'u1', 'u2', 'b1', { response: 'ADDED', guess: 8, verdictNotifiedAt: SENT_AT }));
    const theirs = activity('theirs', 'u2', 'b1', { rating: 3 });
    activities.push(theirs);
    expect((await page()).sent[0].verdict?.recipientScore).toBe(3);

    theirs.rating = null;
    const cleared = (await page()).sent[0];
    expect(cleared.verdict).toBeNull();
    expect(cleared.waiting).toBe('Unread');

    theirs.rating = 9;
    expect((await page()).sent[0].verdict?.recipientScore).toBe(9);
  });

  it('says Removed from their library when the recipient removed it', async () => {
    recs.push(rec('r1', 'u1', 'u2', 'b1', { response: 'ADDED', guess: 8 }));
    const p = await page();
    expect(p.sent[0].verdict).toBeNull();
    expect(p.sent[0].waiting).toBe('Removed from their library');
    expect(p.sent[0].withdrawable).toBe(false);
  });
});

describe('getRecommendationsPage: a title the recipient already owned when it was sent', () => {
  // The activity's createdAt (September) is before the pick's (October).
  const owned = () => activity('theirs', 'u2', 'b1');

  it('stays as nothing having happened while it is unscored', async () => {
    recs.push(rec('r1', 'u1', 'u2', 'b1'));
    activities.push(owned());
    await settleRecommendationsForTitle('u2', 'books', 'b1');
    expect(recs[0].response).toBe('PENDING');
    const sender = (await page('u1')).sent[0];
    expect(sender.waiting).toBe('Unread');
    expect(sender.withdrawable).toBe(true);
    expect((await page('u2')).inbox.map((v) => v.id)).toEqual(['r1']);
  });

  it('stays PENDING when removed without ever being scored', async () => {
    recs.push(rec('r1', 'u1', 'u2', 'b1'));
    activities.push(owned());
    await settleRecommendationsForTitle('u2', 'books', 'b1');
    activities.length = 0;
    await settleRecommendationsForTitle('u2', 'books', 'b1');
    expect(recs[0].response).toBe('PENDING');
    expect((await page('u1')).sent[0].waiting).toBe('Not answered yet');
    expect((await page('u2')).inbox.map((v) => v.id)).toEqual(['r1']);
  });

  it('once scored and settled, removing it says Removed from their library and stays out of the inbox', async () => {
    recs.push(rec('r1', 'u1', 'u2', 'b1', { guess: 8 }));
    const theirs = owned();
    activities.push(theirs);

    theirs.rating = 7;
    await settleRecommendationsForTitle('u2', 'books', 'b1');
    expect(recs[0].response).toBe('ADDED');
    expect((await page('u1')).sent[0].verdict?.recipientScore).toBe(7);

    activities.length = 0;
    await settleRecommendationsForTitle('u2', 'books', 'b1');

    const sender = (await page('u1')).sent[0];
    expect(sender.verdict).toBeNull();
    expect(sender.waiting).toBe('Removed from their library');
    expect(sender.withdrawable).toBe(false);

    const recipient = await page('u2');
    expect(recipient.inbox).toEqual([]);
    expect(recipient.received.map((v) => v.id)).toEqual(['r1']);
  });

  it('comes out the same when it was scored with a switch off', async () => {
    recs.push(rec('r1', 'u1', 'u2', 'b1'));
    activities.push({ ...owned(), rating: 7 });
    users[0].prefs = { compareOptIn: false };
    await settleRecommendationsForTitle('u2', 'books', 'b1');
    expect(recs[0].verdictNotifiedAt).toBeNull();
    users[0].prefs = { compareOptIn: true };

    activities.length = 0;
    const sender = (await page('u1')).sent[0];
    expect(sender.waiting).toBe('Removed from their library');
    expect(sender.withdrawable).toBe(false);
    expect((await page('u2')).inbox).toEqual([]);
  });
});

describe('getRecommendationsPage: the three lists and the record', () => {
  it('sorts to-me rows into inbox and received, and hands the inbox what Add needs', async () => {
    recs.push(
      rec('pending', 'u2', 'u1', 'b1', { note: 'read this', createdAt: new Date('2026-10-03T00:00:00Z') }),
      rec('added', 'u2', 'u1', 'b2', { response: 'ADDED', createdAt: new Date('2026-10-02T00:00:00Z') }),
    );
    const p = await page();
    expect(p.inbox.map((v) => v.id)).toEqual(['pending']);
    expect(p.received.map((v) => v.id)).toEqual(['added']);
    expect(p.sent).toEqual([]);
    expect(p.inbox[0]).toEqual({
      id: 'pending',
      other: 'sam',
      note: 'read this',
      response: 'PENDING',
      createdAt: '2026-10-03T00:00:00.000Z',
      slug: 'books',
      title: 'Paprika',
      imageUrl: 'p.jpg',
      year: 2006,
      externalId: 'ol:1',
      fields: { externalId: 'ol:1', title: 'Paprika', imageUrl: 'p.jpg', year: 2006 },
      myActivityId: null,
      verdict: null,
      waiting: null,
      withdrawable: false,
    });
  });

  it('keeps a title already on my list in the inbox, with my activity, until a verdict', async () => {
    recs.push(rec('r1', 'u2', 'u1', 'b1'));
    const mine = activity('mine', 'u1', 'b1');
    activities.push(mine);
    expect((await page()).inbox[0].myActivityId).toBe('mine');
    mine.status = 'DROPPED';
    const p = await page();
    expect(p.inbox).toEqual([]);
    expect(p.received[0].verdict?.kind).toBe('dropped');
  });

  it('shows titles in the viewer’s language, with every variant in fields', async () => {
    users[0].prefs = { compareOptIn: true, titleLanguage: 'native' };
    recs.push(rec('r1', 'u2', 'u1', 'an1', { category: 'anime' }));
    const view = (await page()).inbox[0];
    expect(view.title).toBe('蟲師');
    expect(view.slug).toBe('anime');
    expect(view.fields).toEqual({
      externalId: 'al:1',
      title: 'Mushishi',
      imageUrl: null,
      year: 2005,
      titleEnglish: 'Mushi-Shi',
      titleRomaji: 'Mushishi',
      titleNative: '蟲師',
    });
  });

  it('builds both records and names the best and worst picks', async () => {
    recs.push(
      rec('r1', 'u1', 'u2', 'b1', { response: 'ADDED', guess: 8 }),
      rec('r2', 'u1', 'u2', 'b2', { response: 'ADDED', guess: 2 }),
      rec('r3', 'u2', 'u1', 'b1', { response: 'PASSED' }),
    );
    activities.push(
      activity('t1', 'u2', 'b1', { rating: 9, status: 'COMPLETED' }),
      activity('t2', 'u2', 'b2', { rating: 3, status: 'COMPLETED' }),
    );
    const p = await page();
    expect(p.mine).toMatchObject({ sent: 2, added: 2, finished: 2, averageScore: 6, averageGuessMiss: 1, bestId: 'r1', worstId: 'r2' });
    expect(p.theirs).toMatchObject({ sent: 1, passed: 1, averageScore: null, bestId: null });
    expect(p.bestWorst).toEqual({ r1: 'Paprika', r2: 'Solaris' });
  });
});

describe('getRecommendationsPage: gates and gaps', () => {
  it('hides recommendations when the other person is opted out, and returns me-off when I am', async () => {
    recs.push(rec('r1', 'u1', 'u3', 'b1', { note: 'hidden' }), rec('r2', 'u3', 'u1', 'b2', { note: 'hidden' }));
    activities.push(activity('theirs', 'u3', 'b1', { rating: 7 }));
    const p = await page();
    expect(p.inbox).toEqual([]);
    expect(p.received).toEqual([]);
    expect(p.sent).toEqual([]);
    expect(p.mine.sent).toBe(0);
    expect(p.theirs.sent).toBe(0);
    expect(JSON.stringify(p)).not.toContain('olive');
    expect(JSON.stringify(activityReads.map((q) => q.where))).not.toContain('u3');

    users[0].prefs = { compareOptIn: false };
    expect(await getRecommendationsPage('u1')).toEqual({ ok: false, reason: 'me-off' });
  });

  it('brings it all back when the switch comes back on', async () => {
    recs.push(rec('r1', 'u1', 'u3', 'b1', { note: 'kept' }));
    expect((await page()).sent).toEqual([]);
    users[2].prefs = { compareOptIn: true };
    expect((await page()).sent[0].note).toBe('kept');
  });

  it('answers me-off for a user who no longer exists', async () => {
    expect(await getRecommendationsPage('gone')).toEqual({ ok: false, reason: 'me-off' });
  });

  it('skips a row whose catalogue title no longer exists', async () => {
    recs.push(rec('r1', 'u1', 'u2', 'gone', { response: 'ADDED' }), rec('r2', 'u2', 'u1', 'gone'), rec('r3', 'u1', 'u2', 'b1'));
    const p = await page();
    expect(p.sent.map((v) => v.id)).toEqual(['r3']);
    expect(p.inbox).toEqual([]);
    expect(p.mine.sent).toBe(1);
    expect(p.theirs.sent).toBe(0);
  });
});

describe('getRecommendContext', () => {
  it('lists friends and marks who already has it; shows who recommended it to me', async () => {
    activities.push(activity('mine', 'u1', 'b1'));
    users.push({ id: 'u4', username: 'zed', prefs: { compareOptIn: true } });
    recs.push(
      rec('r1', 'u1', 'u2', 'b1', { guess: 5 }),
      rec('r2', 'u2', 'u1', 'b1', { note: 'for you', guess: 6 }),
      rec('r3', 'u1', 'u4', 'b2'),
    );
    expect(await getRecommendContext('u1', 'mine')).toEqual({
      friends: [
        { username: 'sam', alreadySent: true },
        { username: 'zed', alreadySent: false },
      ],
      recommendedBy: [{ from: 'sam', note: 'for you' }],
    });
  });

  it('is empty when I am off or the activity is not mine', async () => {
    const empty = { friends: [], recommendedBy: [] };
    activities.push(activity('mine', 'u1', 'b1'), activity('theirs', 'u2', 'b1'));
    recs.push(rec('r1', 'u2', 'u1', 'b1', { note: 'for you' }));
    expect(await getRecommendContext('u1', 'theirs')).toEqual(empty);
    expect(await getRecommendContext('u1', 'nope')).toEqual(empty);
    users[0].prefs = { compareOptIn: false };
    expect(await getRecommendContext('u1', 'mine')).toEqual(empty);
  });

  it('hides a recommendation from someone who has since opted out', async () => {
    activities.push(activity('mine', 'u1', 'b1'));
    recs.push(rec('r1', 'u3', 'u1', 'b1', { note: 'hidden' }));
    const ctx = await getRecommendContext('u1', 'mine');
    expect(ctx.recommendedBy).toEqual([]);
    expect(ctx.friends.map((f) => f.username)).toEqual(['sam']);
  });
});
