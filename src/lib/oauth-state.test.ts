import { describe, expect, it } from 'vitest';

import { OAUTH_STATE_TTL_MS, OAuthStateStore } from './oauth-state';

const who = { session: 'sess-1', userId: 'u1', provider: 'anilist' };

describe('OAuthStateStore', () => {
  it('accepts its own state once, for the same session', () => {
    const store = new OAuthStateStore();
    const state = store.issue(who, 1000);
    expect(state.length).toBeGreaterThan(20);
    expect(store.consume(state, { session: 'sess-1', provider: 'anilist' }, 2000)).toEqual({ ok: true, userId: 'u1' });
    expect(store.consume(state, { session: 'sess-1', provider: 'anilist' }, 2000)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('rejects unknown, missing and forged states', () => {
    const store = new OAuthStateStore();
    store.issue(who, 0);
    expect(store.consume('nope', { session: 'sess-1', provider: 'anilist' }, 1)).toEqual({ ok: false, reason: 'unknown' });
    expect(store.consume(null, { session: 'sess-1', provider: 'anilist' }, 1)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('rejects another session (a link sent to someone else)', () => {
    const store = new OAuthStateStore();
    const state = store.issue(who, 0);
    expect(store.consume(state, { session: 'sess-2', provider: 'anilist' }, 1)).toEqual({ ok: false, reason: 'session' });
    const s2 = store.issue(who, 0);
    expect(store.consume(s2, { session: null, provider: 'anilist' }, 1)).toEqual({ ok: false, reason: 'session' });
  });

  it('rejects expired states and other providers', () => {
    const store = new OAuthStateStore();
    const state = store.issue(who, 0);
    expect(store.consume(state, { session: 'sess-1', provider: 'anilist' }, OAUTH_STATE_TTL_MS)).toEqual({
      ok: false,
      reason: 'expired',
    });
    const s2 = store.issue(who, 0);
    expect(store.consume(s2, { session: 'sess-1', provider: 'trakt' }, 1)).toEqual({ ok: false, reason: 'provider' });
  });
});
