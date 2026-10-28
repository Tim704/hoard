import { describe, expect, it } from 'vitest';

import { LruMap } from '@/lib/lru';

import { confirmSteamApp, rememberSteamMappings } from './steam-confirm';

describe('confirmSteamApp', () => {
  it('confirms only the IGDB game IGDB maps the app id to', async () => {
    const cache = new LruMap<number, string | null>(10);
    const calls: number[] = [];
    const lookup = async (app: number) => {
      calls.push(app);
      return app === 620 ? '72' : null;
    };
    expect(await confirmSteamApp(620, '72', lookup, cache)).toBe(true);
    expect(await confirmSteamApp(620, '999', lookup, cache)).toBe(false); // a forged pairing
    expect(await confirmSteamApp(5, '72', lookup, cache)).toBe(false); // unknown app id
    expect(calls).toEqual([620, 5]); // answers are cached
  });

  it('never confirms hand-made or junk ids, without asking IGDB', async () => {
    const lookup = async () => {
      throw new Error('should not be called');
    };
    expect(await confirmSteamApp(620, 'manual:abc', lookup, new LruMap(10))).toBe(false);
    expect(await confirmSteamApp(0, '72', lookup, new LruMap(10))).toBe(false);
  });

  it('uses mappings remembered from matching', async () => {
    const cache = new LruMap<number, string | null>(10);
    rememberSteamMappings(new Map([[620, { externalId: '72' }], [1, { externalId: 'manual:x' }]]), cache);
    const lookup = async () => {
      throw new Error('should not be called');
    };
    expect(await confirmSteamApp(620, '72', lookup, cache)).toBe(true);
  });

  it('lets a failed lookup throw, so nothing is written', async () => {
    const lookup = async () => {
      throw new Error('IGDB down');
    };
    await expect(confirmSteamApp(620, '72', lookup, new LruMap(10))).rejects.toThrow('IGDB down');
  });
});
