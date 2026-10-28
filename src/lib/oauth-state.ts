// ───────────────────────────────────────────────────────────────────────────
//  OAuth `state` values (8.2). Starting a connection issues a random state
//  bound to the browser's session and kept on the server for 10 minutes; the
//  callback is accepted only with a state this store issued, for the same
//  session, not expired and not used before (each state works once).
//
//  In-process memory (a single app container); a restart simply makes a
//  pending connection start over. `OAuthStateStore` is pure apart from the
//  random id, and takes `now`, so it is unit-tested.
// ───────────────────────────────────────────────────────────────────────────

import { createHash, randomBytes } from 'crypto';

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING = 1000;

interface Pending {
  /** A hash of the session token (the raw token is never kept here). */
  session: string;
  userId: string;
  provider: string;
  expiresAt: number;
}

export type StateCheck = { ok: true; userId: string } | { ok: false; reason: 'unknown' | 'expired' | 'session' | 'provider' };

const hashSession = (s: string) => createHash('sha256').update(s).digest('hex');

export class OAuthStateStore {
  private pending = new Map<string, Pending>();

  /** A new state for this session + user + provider. */
  issue(input: { session: string; userId: string; provider: string }, now = Date.now()): string {
    this.sweep(now);
    // Bounded: the oldest pending states go first.
    while (this.pending.size >= MAX_PENDING) this.pending.delete(this.pending.keys().next().value!);
    const state = randomBytes(24).toString('base64url');
    this.pending.set(state, {
      session: hashSession(input.session),
      userId: input.userId,
      provider: input.provider,
      expiresAt: now + OAUTH_STATE_TTL_MS,
    });
    return state;
  }

  /** Check (and use up) a state from a callback. */
  consume(
    state: string | null | undefined,
    input: { session: string | null | undefined; provider: string },
    now = Date.now(),
  ): StateCheck {
    if (!state) return { ok: false, reason: 'unknown' };
    const p = this.pending.get(state);
    if (!p) return { ok: false, reason: 'unknown' };
    // One use only, whatever the outcome.
    this.pending.delete(state);
    if (p.expiresAt <= now) return { ok: false, reason: 'expired' };
    if (p.provider !== input.provider) return { ok: false, reason: 'provider' };
    if (!input.session || hashSession(input.session) !== p.session) return { ok: false, reason: 'session' };
    return { ok: true, userId: p.userId };
  }

  private sweep(now: number) {
    for (const [k, p] of this.pending) if (p.expiresAt <= now) this.pending.delete(k);
  }
}

// One store per server process (kept across dev hot reloads).
const g = globalThis as unknown as { __hoardOAuthStates?: OAuthStateStore };
export const oauthStates: OAuthStateStore = g.__hoardOAuthStates ?? (g.__hoardOAuthStates = new OAuthStateStore());
