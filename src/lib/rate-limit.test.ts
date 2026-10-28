import { describe, expect, it } from 'vitest';

import { AI_LIMITS, checkRate, takeAiRate, takeRate } from './rate-limit';

describe('checkRate', () => {
  const limits = { perMinute: 3, perDay: 5 };

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
