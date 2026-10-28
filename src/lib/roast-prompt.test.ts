import { describe, expect, it } from 'vitest';

import { ROAST_MAX_TITLES, roastListLines } from './roast-prompt';

describe('roastListLines', () => {
  it('lists the top 200 titles only, best first', () => {
    const rows = Array.from({ length: 450 }, (_, i) => ({ rating: 8, media: { title: `T${i}`, year: 2000 } }));
    const lines = roastListLines(rows).split('\n');
    expect(ROAST_MAX_TITLES).toBe(200);
    expect(lines).toHaveLength(200);
    expect(lines[0]).toBe('1. T0 (2000) — 8.0/10');
    expect(lines[199]).toMatch(/^200\. T199 /);
  });
});
