import { describe, expect, it } from 'vitest';

import { LruMap } from './lru';

describe('LruMap', () => {
  it('drops the least recently used key past its size', () => {
    const m = new LruMap<string, number>(2);
    m.set('a', 1);
    m.set('b', 2);
    expect(m.get('a')).toBe(1); // a is now the most recent
    m.set('c', 3);
    expect(m.get('b')).toBeUndefined();
    expect(m.get('a')).toBe(1);
    expect(m.get('c')).toBe(3);
    expect(m.size).toBe(2);
  });
});
