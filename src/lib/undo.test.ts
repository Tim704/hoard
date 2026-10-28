import { describe, expect, it } from 'vitest';
import {
  ActivityStateSchema,
  planStateRestore,
  restorePlan,
  SNAPSHOT_CHILDREN,
  snapshotPlan,
  stateOf,
  type ActivitySnapshot,
  type ActivityState,
  type Row,
} from './undo';
import { UndoStore } from './undo-store';

// A tiny in-memory "database": model → rows. Reads match on every `where` key.
type Db = Record<string, Row[]>;
const read = (db: Db, model: string, where: Row) =>
  (db[model] ?? []).filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));

/** Every child model gets one row for the activity, plus a row of another activity. */
function seed(): Db {
  const activity = {
    id: 'act1',
    userId: 'u1',
    category: 'ANIME',
    status: 'COMPLETED',
    rating: 8.5,
    tier: 'A',
    queueOrder: null,
    progress: 12,
    notes: null,
    animeId: 'anime1',
    finishedAt: new Date('2026-10-01T10:00:00Z'),
    createdAt: new Date('2026-09-01T10:00:00Z'),
  };
  const db: Db = { userMediaActivity: [activity, { ...activity, id: 'other', animeId: 'anime2' }] };
  for (const model of SNAPSHOT_CHILDREN) {
    db[model] = [
      { id: `${model}-1`, userId: 'u1', activityId: 'act1', meta: null, at: new Date('2026-10-02T00:00:00Z') },
      { id: `${model}-2`, userId: 'u1', activityId: 'other', meta: null },
    ];
  }
  return db;
}

function takeSnapshot(db: Db, activityId: string): ActivitySnapshot {
  const plan = snapshotPlan(activityId);
  const [activity] = read(db, plan.activity.model, plan.activity.where);
  const children = Object.fromEntries(
    plan.children.map((step) => [step.model, read(db, step.model, step.where)]),
  ) as ActivitySnapshot['children'];
  return { activity: activity as ActivitySnapshot['activity'], children };
}

/** Delete with cascade, like Postgres does for the real tables. */
function remove(db: Db, activityId: string) {
  db.userMediaActivity = db.userMediaActivity.filter((r) => r.id !== activityId);
  for (const model of SNAPSHOT_CHILDREN) db[model] = db[model].filter((r) => r.activityId !== activityId);
}

/** createMany: null columns come back as null (Prisma's default for nullable). */
const nullFill = (sample: Row, row: Row) =>
  Object.fromEntries(Object.keys(sample).map((k) => [k, k in row ? row[k] : null]));

describe('snapshot round trip', () => {
  it('a remove followed by a restore brings every row back with the same ids', () => {
    const db = seed();
    const before = structuredClone(db);
    const snapshot = takeSnapshot(db, 'act1');
    remove(db, 'act1');
    expect(read(db, 'userMediaActivity', { id: 'act1' })).toEqual([]);

    const steps = restorePlan(snapshot, 'u1');
    expect(steps[0].model).toBe('userMediaActivity'); // parent before children
    for (const step of steps) {
      const sample = (before[step.model] ?? [])[0];
      for (const row of step.data) db[step.model].push(nullFill(sample, row));
    }

    const byId = (rows: Row[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    for (const model of Object.keys(before)) {
      expect(byId(db[model])).toEqual(byId(before[model]));
    }
  });

  it('snapshots diary entries and play sessions with the activity', () => {
    expect(SNAPSHOT_CHILDREN).toContain('diaryEntry');
    expect(SNAPSHOT_CHILDREN).toContain('playSession');
    expect(SNAPSHOT_CHILDREN).toContain('seasonActivity');
    expect(SNAPSHOT_CHILDREN).toContain('yearDuelScore');
    const snapshot = takeSnapshot(seed(), 'act1');
    const models = restorePlan(snapshot, 'u1').map((s) => s.model);
    expect(models).toEqual([
      'userMediaActivity',
      'activityEvent',
      'diaryEntry',
      'playSession',
      'seasonActivity',
      'yearDuelScore',
    ]);
  });

  it('reads the activity and each child table by activity id', () => {
    const plan = snapshotPlan('a');
    expect(plan.activity).toEqual({ model: 'userMediaActivity', where: { id: 'a' } });
    expect(plan.children.map((c) => c.model)).toEqual([...SNAPSHOT_CHILDREN]);
    expect(plan.children.every((c) => c.where.activityId === 'a')).toBe(true);
  });

  it('leaves null columns out of the create input (JSON null is not a valid input)', () => {
    const snapshot = takeSnapshot(seed(), 'act1');
    const steps = restorePlan(snapshot, 'u1');
    expect('notes' in steps[0].data[0]).toBe(false);
    expect('meta' in steps[1].data[0]).toBe(false);
    expect(steps[0].data[0].id).toBe('act1');
  });

  it('applies activity overrides (a franchise that is gone)', () => {
    const snapshot = takeSnapshot(seed(), 'act1');
    snapshot.activity.franchiseId = 'gone';
    const [activity] = restorePlan(snapshot, 'u1', { franchiseId: null, franchiseLocked: false }).map((s) => s.data[0]);
    expect('franchiseId' in activity).toBe(false);
    expect(activity.franchiseLocked).toBe(false);
  });

  it('refuses snapshots that are not wholly the user\'s own', () => {
    const snapshot = takeSnapshot(seed(), 'act1');
    expect(() => restorePlan(snapshot, 'u2')).toThrow();

    const strayChild = structuredClone(snapshot);
    strayChild.children[SNAPSHOT_CHILDREN[0]].push({ id: 'x', userId: 'u1', activityId: 'other' });
    expect(() => restorePlan(strayChild, 'u1')).toThrow();

    const otherUser = structuredClone(snapshot);
    otherUser.children[SNAPSHOT_CHILDREN[0]].push({ id: 'y', userId: 'u2', activityId: 'act1' });
    expect(() => restorePlan(otherUser, 'u1')).toThrow();
  });
});

describe('UndoStore', () => {
  const snapshot = { activity: { id: 'a', userId: 'u1' }, children: { activityEvent: [], diaryEntry: [], playSession: [], seasonActivity: [], yearDuelScore: [] } } as ActivitySnapshot;

  it('hands the snapshot back only to its owner, and only while fresh', () => {
    const store = new UndoStore(1000, 10);
    const token = store.put('u1', snapshot, 0);
    expect(token).toMatch(/^[\w-]{20,}$/);
    expect(store.get(token, 'u2', 10)).toBeNull();
    expect(store.get(token, 'u1', 10)).toBe(snapshot);
    expect(store.get(token, 'u1', 1000)).toBeNull(); // expired
    expect(store.get('nope', 'u1', 10)).toBeNull();
  });

  it('is bounded, evicting the oldest first', () => {
    const store = new UndoStore(1000, 2);
    const t1 = store.put('u1', snapshot, 0);
    const t2 = store.put('u1', snapshot, 1);
    const t3 = store.put('u1', snapshot, 2);
    expect(store.size).toBe(2);
    expect(store.get(t1, 'u1', 3)).toBeNull();
    expect(store.get(t2, 'u1', 3)).toBe(snapshot);
    expect(store.get(t3, 'u1', 3)).toBe(snapshot);
    store.drop(t3);
    expect(store.get(t3, 'u1', 3)).toBeNull();
  });
});

describe('status-change undo', () => {
  const ids = { userId: 'u1', activityId: 'a1' };
  const current: ActivityState = {
    status: 'COMPLETED',
    rating: 8,
    queueOrder: null,
    finishedAt: '2026-10-28T09:00:00.000Z',
    tier: null,
    rankOrder: null,
    progress: 24,
    rewatching: false,
  };

  it('accepts only the restorable fields', () => {
    expect(ActivityStateSchema.safeParse({ status: 'PLANNED', queueOrder: 3000 }).success).toBe(true);
    expect(ActivityStateSchema.safeParse({ status: 'PLANNED', userId: 'u2' }).success).toBe(false);
    expect(ActivityStateSchema.safeParse({ notes: 'x' }).success).toBe(false);
    expect(ActivityStateSchema.safeParse({ status: 'NOPE' }).success).toBe(false);
    expect(ActivityStateSchema.safeParse({ rating: 11 }).success).toBe(false);
    expect(ActivityStateSchema.safeParse({ progress: 1.5 }).success).toBe(false);
    expect(ActivityStateSchema.safeParse({ finishedAt: 'yesterday' }).success).toBe(false);
  });

  it('round-trips a stored row through stateOf', () => {
    const row = { ...current, finishedAt: new Date(current.finishedAt!) };
    expect(stateOf(row)).toEqual(current);
    expect(ActivityStateSchema.safeParse(stateOf(row)).success).toBe(true);
  });

  it('plans the update and its events', () => {
    const { data, events } = planStateRestore(ids, current, {
      status: 'PLANNED',
      rating: null,
      queueOrder: 2000,
      finishedAt: null,
      tier: null,
      rankOrder: null,
      progress: 3,
    });
    expect(data).toMatchObject({ status: 'PLANNED', rating: null, queueOrder: 2000, finishedAt: null, progress: 3 });
    expect(events.map((e) => [e.kind, e.from, e.to])).toEqual([
      ['status', 'COMPLETED', 'PLANNED'],
      ['score', '8', null],
      ['progress', '24', '3'],
    ]);
  });

  it('converts finishedAt and drops a tier the restored status cannot hold', () => {
    const { data, events } = planStateRestore(ids, { ...current, tier: 'A' }, {
      status: 'CONSUMING',
      finishedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(data.finishedAt).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    expect(data.tier).toBeNull();
    expect(events.map((e) => e.kind)).toEqual(['status', 'tier']);
  });

  it('rounds a restored score like updateActivity does', () => {
    const { data, events } = planStateRestore(ids, current, { rating: 7.25 });
    expect(data.rating).toBe(7.3);
    expect(events.map((e) => [e.kind, e.from, e.to])).toEqual([['score', '8', '7.3']]);
    expect(planStateRestore(ids, current, { rating: 8.04 }).events).toEqual([]);
    expect(planStateRestore(ids, current, { rating: null }).data.rating).toBeNull();
  });

  it('puts a rewatch flag back (undoing Watch again or a rewatch finish)', () => {
    expect(ActivityStateSchema.safeParse({ rewatching: 'yes' }).success).toBe(false);
    const { data } = planStateRestore(ids, { ...current, status: 'CONSUMING', rewatching: true }, {
      status: 'COMPLETED',
      rewatching: false,
      progress: 24,
    });
    expect(data).toMatchObject({ status: 'COMPLETED', rewatching: false, progress: 24 });
  });

  it('carries the diary entry to delete, but never writes it as a column', () => {
    expect(ActivityStateSchema.safeParse({ status: 'CONSUMING', diaryEntryId: 'cm123' }).success).toBe(true);
    expect(ActivityStateSchema.safeParse({ diaryEntryId: '' }).success).toBe(false);
    expect(ActivityStateSchema.safeParse({ diaryEntryId: 5 }).success).toBe(false);
    const { data } = planStateRestore(ids, current, { status: 'CONSUMING', diaryEntryId: 'cm123' });
    expect('diaryEntryId' in data).toBe(false);
    expect(data.status).toBe('CONSUMING');
  });

  it('writes no events when nothing changes', () => {
    expect(planStateRestore(ids, current, { ...current }).events).toEqual([]);
  });
});
