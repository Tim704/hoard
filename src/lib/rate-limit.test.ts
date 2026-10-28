import { describe, expect, it } from 'vitest';

import { AI_LIMITS, API_LIMITS, checkRate, takeAiRate, takeApiRate, takeRate, takeTasteRefreshRate } from './rate-limit';

describe('checkRate', () => {
  const limits = { perMinute: 3, perDay: 5, noun: 'AI requests' };

  it('allows up to the per-minute limit, then says when to retry', () => {
    let stamps: number[] = [];
    for (const t of [0, 1000, 2000]) {
      const d = checkRate(stamps, limits, t);
      expect(d.ok).toBe(true);
      stamps = d.stamps;
    }
    const blocked = checkRate(stamps, limits, 3000);
    expect(blocked).toMatchObject({ ok: false, retryAfterSec: 57 });
    expect(!blocked.ok && blocked.message).toMatch(/Too many AI requests\. Try again in 57 s\./);
    // A minute after the first call, one slot is free again.
    expect(checkRate(stamps, limits, 60_001).ok).toBe(true);
  });

  it('caps the day, and forgets calls older than a day', () => {
    const day = 24 * 3600_000;
    const stamps = [0, 100_000, 200_000, 300_000, 400_000];
    const blocked = checkRate(stamps, limits, 500_000);
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.message).toMatch(/today's 5 AI requests/);
    const later = checkRate(stamps, limits, day + 50_000);
    expect(later.ok).toBe(true);
    expect(later.stamps).toEqual([100_000, 200_000, 300_000, 400_000, day + 50_000]);
  });

  it('keeps one budget per key in the shared store', () => {
    const now = 1_000_000_000;
    for (let i = 0; i < AI_LIMITS.perMinute; i++) expect(takeAiRate('u1', now + i).ok).toBe(true);
    expect(takeAiRate('u1', now + 20).ok).toBe(false);
    expect(takeAiRate('u2', now + 20).ok).toBe(true);
    expect(takeRate('other:u1', { perMinute: 1, perDay: 1 }, now).ok).toBe(true);
  });
});

describe('invite limit', () => {
  it('allows 5 a minute and 20 a day per user', async () => {
    const { takeInviteRate } = await import('./rate-limit');
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < 5; i++) expect(takeInviteRate('inv-u', t0 + i).ok).toBe(true);
    expect(takeInviteRate('inv-u', t0 + 10).ok).toBe(false);
    expect(takeInviteRate('inv-other', t0 + 10).ok).toBe(true);
    let ok = 0;
    for (let m = 1; m <= 30; m++) if (takeInviteRate('inv-u', t0 + m * 61_000).ok) ok++;
    expect(ok).toBe(15);
  });
});

describe('hourly window (taste refresh)', () => {
  const limits = { perMinute: 2, perHour: 5, perDay: 30 };

  it('caps the hour, then frees up as the oldest call ages out', () => {
    let stamps: number[] = [];
    for (const t of [0, 61_000, 122_000, 183_000, 244_000]) {
      const d = checkRate(stamps, limits, t);
      expect(d.ok).toBe(true);
      stamps = d.stamps;
    }
    const blocked = checkRate(stamps, limits, 400_000);
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.retryAfterSec).toBe(3200);
    expect(!blocked.ok && blocked.message).toMatch(/about 54 minutes/);
    expect(checkRate(stamps, limits, 3_600_001).ok).toBe(true);
  });

  it('keeps refreshes apart from the AI budget', () => {
    const now = 9_000_000_000;
    for (let i = 0; i < 2; i++) expect(takeTasteRefreshRate('u-taste', now + i).ok).toBe(true);
    expect(takeTasteRefreshRate('u-taste', now + 2).ok).toBe(false);
    expect(takeAiRate('u-taste', now + 3).ok).toBe(true);
  });
});

describe('the public API limit (8.7)', () => {
  it('allows 60 a minute per token, keeping only a minute of history', () => {
    expect(API_LIMITS).toEqual({ perMinute: 60 });
    const t0 = 5_000_000;
    for (let i = 0; i < 60; i++) expect(takeApiRate('tok-a', t0 + i).ok).toBe(true);
    const blocked = takeApiRate('tok-a', t0 + 100);
    expect(blocked).toMatchObject({ ok: false, retryAfterSec: 60 });
    // Another token has its own budget.
    expect(takeApiRate('tok-b', t0 + 100).ok).toBe(true);
    // A minute later the window has moved on, and old stamps are dropped.
    const later = takeApiRate('tok-a', t0 + 60_001);
    expect(later.ok).toBe(true);
    expect(later.stamps.length).toBeLessThanOrEqual(60);
  });

  it('never blocks on a day count without perDay', () => {
    const stamps = Array.from({ length: 1000 }, (_, i) => i * 61_000);
    const d = checkRate(stamps, { perMinute: 60 }, 1000 * 61_000);
    expect(d.ok).toBe(true);
    expect(d.stamps).toEqual([1000 * 61_000]);
  });
});

describe('cost accounting (re-review 2: import budgets in rows)', () => {
  it('charges a call its row count; chunk size does not change the budget', () => {
    const limits = { perMinute: 600, perDay: 30_000 };
    let stamps: number[] = [];
    // 60 chunks of 10 rows fill the minute exactly...
    for (let i = 0; i < 60; i++) {
      const d = checkRate(stamps, limits, 1000 + i, 10);
      expect(d.ok).toBe(true);
      stamps = d.stamps;
    }
    expect(stamps).toHaveLength(600);
    // ...so one more row is refused, with the time until enough rows expire.
    const blocked = checkRate(stamps, limits, 2000, 10);
    expect(blocked).toMatchObject({ ok: false });
    expect(!blocked.ok && blocked.retryAfterSec).toBe(59);
    expect(checkRate(stamps, limits, 61_011, 10).ok).toBe(true); // the first 10 rows expired
  });

  it('one call of 20 rows fits when 20 slots are free, not when 19 are', () => {
    const limits = { perMinute: 30 };
    const ten = Array.from({ length: 10 }, (_, i) => i);
    expect(checkRate(ten, limits, 100, 20).ok).toBe(true);
    expect(checkRate([...ten, 50], limits, 100, 20).ok).toBe(false);
  });

  it('takeActionCost counts rows against the per-user import budget', async () => {
    const { takeActionCost, ACTION_LIMITS } = await import('./rate-limit');
    expect(ACTION_LIMITS.matchImportRows.perMinute).toBe(600);
    expect(ACTION_LIMITS.commitImportRows.perMinute).toBe(1200);
    const now = 7_000_000_000;
    for (let i = 0; i < 60; i++) expect(takeActionCost('commitImportRows', 'rows-u', 20, now + i).ok).toBe(true);
    const d = takeActionCost('commitImportRows', 'rows-u', 1, now + 100);
    expect(d.ok).toBe(false);
    expect(!d.ok && d.retryAfterSec).toBeGreaterThan(0);
    expect(takeActionCost('commitImportRows', 'rows-other', 20, now + 100).ok).toBe(true);
  });
});

describe('takeAllRates and rateKey (re-review 4)', () => {
  it('charges every budget only when all allow', async () => {
    const { takeAllRates, peekRate } = await import('./rate-limit');
    const now = 8_000_000_000;
    const tight = { perMinute: 1 };
    const loose = { perMinute: 100 };
    expect(takeAllRates([{ key: 'all-a', limits: tight }, { key: 'all-b', limits: loose }], now).ok).toBe(true);
    // all-a is spent: the refused call must not charge all-b.
    for (let i = 0; i < 5; i++) expect(takeAllRates([{ key: 'all-a', limits: tight }, { key: 'all-b', limits: loose }], now + 1).ok).toBe(false);
    const b = peekRate('all-b', loose, now + 2);
    expect(b.ok && b.stamps.length).toBe(2); // the first call, plus the peeked one
  });

  it('joins key parts with NUL, so parts cannot forge a boundary', async () => {
    const { rateKey } = await import('./rate-limit');
    expect(rateKey('login', 'pair', 'a:b', 'c')).not.toBe(rateKey('login', 'pair', 'a', 'b:c'));
    expect(rateKey('x', 'y')).toBe('x\u0000y');
  });
});
