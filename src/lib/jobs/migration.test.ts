import { describe, expect, it } from 'vitest';

import { MIGRATION_STEPS, runMigrations } from './migration';

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
    await expect(runMigrations(steps)).rejects.toThrow('b: boom');
    expect(order).toEqual(['a', 'b', 'c']);
    await expect(runMigrations([])).resolves.toBeUndefined();
  });
});
