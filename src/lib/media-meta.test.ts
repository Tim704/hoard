import { describe, expect, it } from 'vitest';

import { formatTimeToBeat } from './media-meta';

describe('formatTimeToBeat', () => {
  it('rounds to whole hours from 10 h, one decimal below', () => {
    expect(formatTimeToBeat(32.4)).toBe('≈ 32 h');
    expect(formatTimeToBeat(60)).toBe('≈ 60 h');
    expect(formatTimeToBeat(1.5)).toBe('≈ 1.5 h');
    expect(formatTimeToBeat(9.96)).toBe('≈ 10 h');
  });

  it('is null when unknown', () => {
    expect(formatTimeToBeat(null)).toBeNull();
    expect(formatTimeToBeat(0)).toBeNull();
    expect(formatTimeToBeat(undefined)).toBeNull();
  });
});
