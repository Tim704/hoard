import { describe, expect, it } from 'vitest';

import { planDiaryBackfill, type BackfillCandidate } from '@/lib/diary';

import { MIGRATION_STEPS, runMigrations, type MigrationStep } from './migration';
import type { MigrationStore } from './migration-store';

/** An in-memory store of finished steps. */
function memoryStore(done: string[] = []): MigrationStore & { done: Set<string> } {
  const set = new Set(done);
  return {
    done: set,
    isDone: async (id) => set.has(id),
    markDone: async (id) => void set.add(id),
  };
}

describe('runMigrations', () => {
  it('has unique step ids', () => {
    const ids = MIGRATION_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('runs every step in order and reports failures after the rest ran', async () => {
    const order: string[] = [];
    const steps = [
      { id: 'a', run: async () => void order.push('a') },
      { id: 'b', run: async () => { order.push('b'); throw new Error('boom'); } },
      { id: 'c', run: async () => void order.push('c') },
    ];
    await expect(runMigrations(steps, memoryStore())).rejects.toThrow('b: boom');
    expect(order).toEqual(['a', 'b', 'c']);
    await expect(runMigrations([], memoryStore())).resolves.toBeUndefined();
  });

  it('runs a step once: a finished step is skipped at the next startup', async () => {
    const store = memoryStore();
    let runs = 0;
    const steps = [{ id: 'once', run: async () => void runs++ }];
    await runMigrations(steps, store);
    await runMigrations(steps, store);
    expect(runs).toBe(1);
    expect(store.done.has('once')).toBe(true);
  });

  it('retries a failed step at the next startup and records it only after a clean run', async () => {
    const store = memoryStore();
    let attempts = 0;
    const steps = [
      {
        id: 'flaky',
        run: async () => {
          attempts++;
          if (attempts === 1) throw new Error('db down');
        },
      },
    ];
    await expect(runMigrations(steps, store)).rejects.toThrow('flaky: db down');
    expect(store.done.has('flaky')).toBe(false);
    await runMigrations(steps, store);
    expect(attempts).toBe(2);
    expect(store.done.has('flaky')).toBe(true);
    await runMigrations(steps, store);
    expect(attempts).toBe(2);
  });

  it('a diary entry the user deleted after the backfill is not recreated', async () => {
    const activities: BackfillCandidate[] = [
      { id: 'a1', userId: 'u', status: 'COMPLETED', finishedAt: new Date('2026-03-01T12:00:00Z'), rating: 8 },
    ];
    const entries: { activityId: string; date: string }[] = [];
    const backfill: MigrationStep = {
      id: '003-diary-from-finished',
      run: async () => {
        const withEntries = new Set(entries.map((e) => e.activityId));
        entries.push(...planDiaryBackfill(activities, withEntries, 'Europe/Berlin').map((e) => ({ activityId: e.activityId, date: e.date })));
      },
    };
    const store = memoryStore();
    await runMigrations([backfill], store);
    expect(entries).toEqual([{ activityId: 'a1', date: '2026-03-01' }]);
    entries.length = 0; // the user deletes it on /diary
    await runMigrations([backfill], store); // next startup
    expect(entries).toEqual([]);
  });
});
