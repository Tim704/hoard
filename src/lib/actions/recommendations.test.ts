// Sending, passing and withdrawing recommendations. Every path re-checks both
// switches, an unavailable user always gets one answer, and neither the note
// nor the guess ever reaches a notification.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const users: Row[] = [];
const activities: Row[] = [];
const books: Row[] = [];
const recs: Row[] = [];
const activitySelects: { where: any; select: any }[] = [];
const notifyMock = vi.fn();
let currentUser = { id: 'u1', username: 'tim' };
let createError: unknown = null;
let nextRec = 0;

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

const uniqueKey = (r: Row) => [r.fromId, r.toId, r.category, r.mediaId].join('|');

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: async ({ where, select }: any) => project(users.find((u) => matches(u, where)), select),
      findMany: async ({ where, select }: any) =>
        users.filter((u) => u.id !== where.id.not && u.prefs?.compareOptIn === true).map((u) => project(u, select)),
    },
    book: { findUnique: async ({ where }: any) => books.find((b) => b.id === where.id) ?? null },
    userMediaActivity: {
      findFirst: async ({ where, select }: any) => {
        activitySelects.push({ where, select });
        return project(activities.find((a) => matches(a, where)), select);
      },
      findMany: async ({ where, select }: any) =>
        activities.filter((a) => (where.OR as Row[]).some((w) => matches(a, w))).map((a) => project(a, select)),
    },
    recommendation: {
      findMany: async ({ where, select }: any) => recs.filter((r) => matches(r, where)).map((r) => project(r, select)),
      findUnique: async ({ where, select }: any) => {
        const compound = where.fromId_toId_category_mediaId;
        return project(recs.find((r) => (compound ? uniqueKey(r) === uniqueKey(compound) : r.id === where.id)), select);
      },
      create: async ({ data, select }: any) => {
        if (createError) throw createError;
        if (recs.some((r) => uniqueKey(r) === uniqueKey(data))) throw Object.assign(new Error('unique'), { code: 'P2002' });
        const row = { id: `rec-${++nextRec}`, response: 'PENDING', respondedAt: null, ...data };
        recs.push(row);
        return project(row, select);
      },
      updateMany: async ({ where, data }: any) => {
        const hits = recs.filter((r) => matches(r, where));
        hits.forEach((r) => Object.assign(r, data));
        return { count: hits.length };
      },
      deleteMany: async ({ where }: any) => {
        const before = recs.length;
        for (let i = recs.length - 1; i >= 0; i--) if (matches(recs[i], where)) recs.splice(i, 1);
        return { count: before - recs.length };
      },
    },
  },
}));
vi.mock('@/lib/session', () => ({ requireUser: async () => currentUser }));
vi.mock('@/lib/notify', () => ({ notify: (...args: unknown[]) => notifyMock(...args) }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const { loadRecommendContext, passRecommendation, sendRecommendation, unpassRecommendation, withdrawRecommendation } =
  await import('./recommendations');

const UNAVAILABLE = "That user isn't available.";
const NOT_FOUND = { ok: false, error: 'Not found.' };

function activity(id: string, userId: string, mediaId: string, extra: Row = {}): Row {
  return { id, userId, category: 'BOOK', bookId: mediaId, status: 'PLANNED', rating: null, notes: 'private', ...extra };
}

function rec(extra: Row = {}): Row {
  return {
    id: 'r1',
    fromId: 'u1',
    toId: 'u2',
    category: 'books',
    mediaId: 'b1',
    note: null,
    guess: null,
    response: 'PENDING',
    respondedAt: null,
    ...extra,
  };
}

const prefsOn = { compareOptIn: true };
const setOptIn = (id: string, on: boolean) => {
  users.find((u) => u.id === id)!.prefs = { compareOptIn: on };
};

beforeEach(() => {
  users.length = activities.length = books.length = recs.length = activitySelects.length = 0;
  notifyMock.mockReset();
  notifyMock.mockResolvedValue({ id: 'n', push: { sent: [], error: null } });
  currentUser = { id: 'u1', username: 'tim' };
  createError = null;
  nextRec = 0;
  delete (globalThis as { __hoardRateLimits?: unknown }).__hoardRateLimits;
  users.push(
    { id: 'u1', username: 'tim', prefs: prefsOn },
    { id: 'u2', username: 'sam', prefs: prefsOn },
    { id: 'u3', username: 'olive', prefs: { compareOptIn: false } },
  );
  books.push(
    { id: 'b1', externalId: 'ol:1', title: 'Paprika' },
    { id: 'b2', externalId: 'manual:xyz', title: 'My zine' },
    { id: 'b3', externalId: 'ol:3', title: 'Solaris', titleRomaji: 'Solaris (romaji)' },
  );
  activities.push(
    activity('a1', 'u1', 'b1'),
    activity('a2', 'u2', 'b3'),
    activity('a3', 'u1', 'b2'),
  );
});

describe('sendRecommendation', () => {
  it('sends, and tells the recipient without the note or guess', async () => {
    const res = await sendRecommendation('a1', 'sam', { note: 'secret note', guess: 8 });
    expect(res).toEqual({ ok: true });
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      fromId: 'u1',
      toId: 'u2',
      category: 'books',
      mediaId: 'b1',
      note: 'secret note',
      guess: 8,
      response: 'PENDING',
    });

    expect(notifyMock).toHaveBeenCalledTimes(1);
    const [to, msg] = notifyMock.mock.calls[0];
    expect(to).toBe('u2');
    expect(msg).toEqual({
      kind: 'friends',
      title: 'tim recommended Paprika',
      body: 'Open Recommendations to see it.',
      url: '/recommendations',
      dedupeKey: 'rec-new:rec-1',
    });
    expect(msg.kind).toBe('friends');
    expect(JSON.stringify(msg)).not.toContain('secret note');
    expect(JSON.stringify(msg)).not.toMatch(/\b8\b/);
  });

  it('names the title in the recipient’s language', async () => {
    activities.push(activity('a4', 'u1', 'b3'));
    users.find((u) => u.id === 'u2')!.prefs = { compareOptIn: true, titleLanguage: 'romaji' };
    await sendRecommendation('a4', 'sam', {});
    expect(notifyMock.mock.calls[0][1].title).toBe('tim recommended Solaris (romaji)');
  });

  it('answers unknown, self and opted-out users identically', async () => {
    const answers = [
      await sendRecommendation('a1', 'nobody', {}),
      await sendRecommendation('a1', 'tim', {}),
      await sendRecommendation('a1', 'olive', {}),
      await sendRecommendation('a1', 42 as unknown as string, {}),
    ];
    for (const a of answers) expect(a).toEqual({ ok: false, error: UNAVAILABLE });
    expect(recs).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('refuses when I am opted out', async () => {
    setOptIn('u1', false);
    expect(await sendRecommendation('a1', 'sam', {})).toEqual({ ok: false, error: UNAVAILABLE });
    expect(recs).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('refuses someone else’s activity as Not found', async () => {
    expect(await sendRecommendation('a2', 'sam', {})).toEqual(NOT_FOUND);
    expect(await sendRecommendation('nope', 'sam', {})).toEqual(NOT_FOUND);
    expect(recs).toEqual([]);
  });

  it('refuses a manual entry', async () => {
    expect(await sendRecommendation('a3', 'sam', {})).toEqual({ ok: false, error: "Hand-made entries can't be sent." });
    expect(recs).toEqual([]);
  });

  it('refuses an over-long note or a guess out of range', async () => {
    expect((await sendRecommendation('a1', 'sam', { note: 'x'.repeat(501) })).ok).toBe(false);
    expect((await sendRecommendation('a1', 'sam', { guess: 11 })).ok).toBe(false);
    expect(recs).toEqual([]);
  });

  it.each([
    ['scored it', { status: 'CONSUMING', rating: 7 }],
    ['scored it zero', { status: 'CONSUMING', rating: 0 }],
    ['dropped it', { status: 'DROPPED', rating: null }],
  ])('refuses when the recipient %s', async (_label, state) => {
    activities.push(activity('a5', 'u2', 'b1', state));
    expect(await sendRecommendation('a1', 'sam', {})).toEqual({
      ok: false,
      error: "They've already made up their mind on this one. See Compare.",
    });
    expect(recs).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('reads the recipient’s entry for status and rating only', async () => {
    activities.push(activity('a5', 'u2', 'b1'));
    await sendRecommendation('a1', 'sam', {});
    const reads = activitySelects.filter((q) => q.where.userId === 'u2');
    expect(reads).toHaveLength(1);
    expect(Object.keys(reads[0].select).sort()).toEqual(['rating', 'status']);
  });

  it('allows a title I have not scored', async () => {
    expect(activities.find((a) => a.id === 'a1')!.rating).toBeNull();
    expect(await sendRecommendation('a1', 'sam', {})).toEqual({ ok: true });
    expect(recs).toHaveLength(1);
  });

  it('allows a title on their list unscored, and leaves it PENDING so the inbox can say Already on your list', async () => {
    activities.push(activity('a5', 'u2', 'b1', { status: 'PLANNED', rating: null }));
    expect(await sendRecommendation('a1', 'sam', {})).toEqual({ ok: true });
    expect(recs[0].response).toBe('PENDING');
  });

  it('turns a duplicate (P2002) into the friendly message', async () => {
    createError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    expect(await sendRecommendation('a1', 'sam', {})).toEqual({ ok: false, error: "You've already sent them this." });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('gives a double-click one send and one friendly refusal, and one notification', async () => {
    const results = await Promise.all([sendRecommendation('a1', 'sam', {}), sendRecommendation('a1', 'sam', {})]);
    expect(results).toContainEqual({ ok: true });
    expect(results).toContainEqual({ ok: false, error: "You've already sent them this." });
    expect(recs).toHaveLength(1);
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it('never re-sends a passed title', async () => {
    recs.push(rec({ response: 'PASSED' }));
    expect(await sendRecommendation('a1', 'sam', {})).toEqual({ ok: false, error: "You've already sent them this." });
    expect(recs).toHaveLength(1);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('hides a database error behind the fallback', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createError = new Error('connection string with a password');
    const res = await sendRecommendation('a1', 'sam', {});
    expect(res.ok).toBe(false);
    expect(res.error).not.toContain('password');
    spy.mockRestore();
  });

  it('limits how many a person can send', async () => {
    for (let i = 0; i < 10; i++) await sendRecommendation('nope', 'sam', {});
    const res = await sendRecommendation('a1', 'sam', {});
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Too many recommendations');
    expect(recs).toEqual([]);
  });
});

describe('passRecommendation and withdrawRecommendation', () => {
  it('only the recipient can pass; only the sender can withdraw, and only while canWithdraw', async () => {
    recs.push(rec());

    // Pass: the sender and a stranger get the same answer as an unknown id.
    expect(await passRecommendation('r1')).toEqual(NOT_FOUND);
    currentUser = { id: 'u3', username: 'olive' };
    expect(await passRecommendation('r1')).toEqual(NOT_FOUND);
    expect(await passRecommendation('nope')).toEqual(NOT_FOUND);
    expect(recs[0].response).toBe('PENDING');

    // Withdraw: the recipient and a stranger neither.
    expect(await withdrawRecommendation('r1')).toEqual(NOT_FOUND);
    currentUser = { id: 'u2', username: 'sam' };
    expect(await withdrawRecommendation('r1')).toEqual(NOT_FOUND);
    expect(await withdrawRecommendation('nope')).toEqual(NOT_FOUND);
    expect(recs).toHaveLength(1);

    // The recipient passes.
    expect(await passRecommendation('r1')).toEqual({ ok: true });
    expect(recs[0].response).toBe('PASSED');
    expect(recs[0].respondedAt).toBeInstanceOf(Date);

    // Passed: too late for the sender.
    currentUser = { id: 'u1', username: 'tim' };
    expect((await withdrawRecommendation('r1')).ok).toBe(false);
    expect(recs).toHaveLength(1);
  });

  it('lets the sender take back a pick nothing has happened to', async () => {
    recs.push(rec());
    activities.push(activity('a5', 'u2', 'b1', { status: 'PLANNED', rating: null }));
    expect(await withdrawRecommendation('r1')).toEqual({ ok: true });
    expect(recs).toEqual([]);
  });

  it.each([
    ['ADDED', {}],
    ['PENDING', { status: 'CONSUMING', rating: 6 }],
    ['PENDING', { status: 'DROPPED', rating: null }],
  ])('refuses to withdraw a %s pick the recipient has answered (%j)', async (response, state) => {
    recs.push(rec({ response }));
    if ('status' in state) activities.push(activity('a5', 'u2', 'b1', state));
    const res = await withdrawRecommendation('r1');
    expect(res.ok).toBe(false);
    expect(recs).toHaveLength(1);
  });

  it('answers OK to a second Pass on a pick already passed (a double tap, or a second tab)', async () => {
    recs.push(rec());
    currentUser = { id: 'u2', username: 'sam' };
    expect(await passRecommendation('r1')).toEqual({ ok: true });
    expect(await passRecommendation('r1')).toEqual({ ok: true });
    expect(recs[0].response).toBe('PASSED');
  });

  it('lets only the recipient undo a pass, back to PENDING, while there is no verdict', async () => {
    recs.push(rec({ response: 'PASSED', respondedAt: new Date() }));
    expect(await unpassRecommendation('r1')).toEqual(NOT_FOUND);
    currentUser = { id: 'u3', username: 'olive' };
    expect(await unpassRecommendation('r1')).toEqual(NOT_FOUND);
    expect(recs[0].response).toBe('PASSED');

    currentUser = { id: 'u2', username: 'sam' };
    expect(await unpassRecommendation('r1')).toEqual({ ok: true });
    expect(recs[0]).toMatchObject({ response: 'PENDING', respondedAt: null });
    // Again: already back, nothing to do.
    expect(await unpassRecommendation('r1')).toEqual({ ok: true });
  });

  it('will not undo a pass once they have scored it, or once it was added', async () => {
    recs.push(rec({ response: 'PASSED', respondedAt: new Date() }));
    activities.push(activity('a5', 'u2', 'b1', { status: 'COMPLETED', rating: 7 }));
    currentUser = { id: 'u2', username: 'sam' };
    expect((await unpassRecommendation('r1')).ok).toBe(false);
    expect(recs[0].response).toBe('PASSED');

    recs[0].response = 'ADDED';
    activities.length = 0;
    expect((await unpassRecommendation('r1')).ok).toBe(false);
    expect(recs[0].response).toBe('ADDED');
  });

  it('will not pass a pick already added', async () => {
    recs.push(rec({ response: 'ADDED' }));
    currentUser = { id: 'u2', username: 'sam' };
    expect((await passRecommendation('r1')).ok).toBe(false);
    expect(recs[0].response).toBe('ADDED');
  });

  it.each([
    ['my', 'u2', 'u2'],
    ['their', 'u1', 'u2'],
  ])('answers Not found when %s switch is off', async (_label, off, actor) => {
    recs.push(rec());
    setOptIn(off, false);
    currentUser = { id: actor, username: actor };
    expect(await passRecommendation('r1')).toEqual(NOT_FOUND);
    expect(recs[0].response).toBe('PENDING');

    currentUser = { id: 'u1', username: 'tim' };
    expect(await withdrawRecommendation('r1')).toEqual(NOT_FOUND);
    expect(recs).toHaveLength(1);
  });
});

describe('loadRecommendContext', () => {
  it('returns the context for my own title', async () => {
    recs.push(rec({ id: 'r9', fromId: 'u2', toId: 'u1', note: 'for you', guess: 6 }));
    expect(await loadRecommendContext('a1')).toEqual({
      ok: true,
      context: {
        friends: [{ username: 'sam', alreadySent: false, decided: false }],
        recommendedBy: [{ from: 'sam', note: 'for you' }],
      },
    });
  });

  it('answers Not found for something that is not an id', async () => {
    expect(await loadRecommendContext(42 as unknown as string)).toEqual(NOT_FOUND);
  });
});
