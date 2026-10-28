// ───────────────────────────────────────────────────────────────────────────
//  A small per-key rate limiter (in memory, one process). Registration is
//  open, so anything that spends the owner's paid API quota (the Gemini
//  calls: roast, "Paste a list", later AI features) goes through it per user.
//
//  Each key keeps the timestamps of its allowed calls from the last day, so
//  both windows are exact. The store lives on globalThis, so dev-server hot
//  reloads keep it; a restart forgets it (fine for a soft limit). Pure apart
//  from that store: `checkRate` takes the stamps and the clock.
// ───────────────────────────────────────────────────────────────────────────

export interface RateLimits {
  perMinute: number;
  /** Optional middle window (e.g. the taste profile's Refresh). */
  perHour?: number;
  /** Optional: without it, only the shorter windows' calls are kept (the public API). */
  perDay?: number;
  /** What is counted, for the message ("AI requests"); default "requests". */
  noun?: string;
}

/** The AI features' shared budget per user. */
export const AI_LIMITS: RateLimits = { perMinute: 10, perDay: 100, noun: 'AI requests' };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * 60 * MINUTE;

export type RateDecision =
  | { ok: true; stamps: number[] }
  | { ok: false; stamps: number[]; retryAfterSec: number; message: string };

/**
 * Whether one more call fits `limits`, given the earlier calls' `stamps`.
 * Returns the pruned stamps (plus `now` when allowed) to store back.
 */
export function checkRate(stamps: number[], limits: RateLimits, now: number, cost = 1): RateDecision {
  // Keep only as much history as the longest window needs.
  const horizon = limits.perDay != null ? DAY : limits.perHour != null ? HOUR : MINUTE;
  const recent = stamps.filter((t) => t > now - horizon && t <= now);
  const noun = limits.noun ?? 'requests';
  // `cost` units at once (e.g. import rows): never more than one window holds.
  const n = Math.max(1, Math.min(Math.floor(cost), limits.perMinute));
  /** Seconds until enough of `inWindow` (oldest first) expires for `n` more, or null when they fit. */
  const wait = (inWindow: number[], limit: number, span: number): number | null => {
    const excess = inWindow.length + n - limit;
    if (excess <= 0) return null;
    const freeing = inWindow[Math.min(excess - 1, inWindow.length - 1)];
    return Math.max(1, Math.ceil((freeing + span - now) / 1000));
  };
  const lastMinute = recent.filter((t) => t > now - MINUTE);
  const minuteWait = wait(lastMinute, limits.perMinute, MINUTE);
  if (minuteWait !== null) {
    return { ok: false, stamps: recent, retryAfterSec: minuteWait, message: `Too many ${noun}. Try again in ${minuteWait} s.` };
  }
  if (limits.perHour != null) {
    const hourWait = wait(recent.filter((t) => t > now - HOUR), limits.perHour, HOUR);
    if (hourWait !== null) {
      const minutes = Math.ceil(hourWait / 60);
      return {
        ok: false,
        stamps: recent,
        retryAfterSec: hourWait,
        message: `Too many requests. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      };
    }
  }
  if (limits.perDay != null) {
    const dayWait = wait(recent, limits.perDay, DAY);
    if (dayWait !== null) {
      const hours = Math.ceil(dayWait / 3600);
      return {
        ok: false,
        stamps: recent,
        retryAfterSec: dayWait,
        message: `You've used today's ${limits.perDay} ${noun}. Try again in about ${hours} hour${hours === 1 ? '' : 's'}.`,
      };
    }
  }
  return { ok: true, stamps: [...recent, ...Array.from({ length: n }, () => now)] };
}

type Store = Map<string, number[]>;
const globalStore = globalThis as unknown as { __hoardRateLimits?: Store };

function store(): Store {
  if (!globalStore.__hoardRateLimits) globalStore.__hoardRateLimits = new Map();
  return globalStore.__hoardRateLimits;
}

/** Count one call against `key` if it fits `limits` (the in-process store). */
export function takeRate(key: string, limits: RateLimits, now: number = Date.now(), cost = 1): RateDecision {
  const s = store();
  const decision = checkRate(s.get(key) ?? [], limits, now, cost);
  if (decision.stamps.length) s.set(key, decision.stamps);
  else s.delete(key);
  return decision;
}

/** Whether one more call would fit, without counting it (the store is not changed). */
export function peekRate(key: string, limits: RateLimits, now: number = Date.now(), cost = 1): RateDecision {
  return checkRate(store().get(key) ?? [], limits, now, cost);
}

/**
 * A rate key from its parts, joined by NUL so no part (a username, an IP) can
 * forge another key's boundary ("a:b" + "c" vs "a" + "b:c").
 */
export function rateKey(...parts: string[]): string {
  return parts.join('\u0000');
}

/**
 * Several budgets at once, atomically: every one is checked first and all
 * are charged only when all allow. A refused attempt charges nothing, so a
 * flood refused by one budget can't drain another (e.g. lock a username out
 * from every address).
 */
export function takeAllRates(
  budgets: { key: string; limits: RateLimits; cost?: number }[],
  now: number = Date.now(),
): RateDecision {
  for (const b of budgets) {
    const d = peekRate(b.key, b.limits, now, b.cost);
    if (!d.ok) return d;
  }
  let last: RateDecision = { ok: true, stamps: [] };
  for (const b of budgets) last = takeRate(b.key, b.limits, now, b.cost);
  return last;
}

/** One AI call for `userId` (roast, Paste a list, …), shared across the AI features. */
export function takeAiRate(userId: string, now?: number): RateDecision {
  return takeRate(`ai:${userId}`, AI_LIMITS, now);
}

/** The taste profile's Refresh button (7.2): cheap, but a full recompute. */
export const TASTE_REFRESH_LIMITS: RateLimits = { perMinute: 2, perHour: 5, perDay: 30 };

/** One taste-profile refresh by `userId`. */
export function takeTasteRefreshRate(userId: string, now?: number): RateDecision {
  return takeRate(`taste:${userId}`, TASTE_REFRESH_LIMITS, now);
}

/** List invitations per user (4.11): they notify someone else, so keep them modest. */
export const INVITE_LIMITS: RateLimits = { perMinute: 5, perDay: 20 };

/** One list invitation by `userId`. The message is the caller's to write. */
export function takeInviteRate(userId: string, now?: number): RateDecision {
  return takeRate(`invite:${userId}`, INVITE_LIMITS, now);
}

/** The public API (8.7): 60 requests a minute per token. */
export const API_LIMITS: RateLimits = { perMinute: 60 };

/** One public-API request with token `tokenId`. */
export function takeApiRate(tokenId: string, now?: number): RateDecision {
  return takeRate(`api:${tokenId}`, API_LIMITS, now);
}

/** Failed public-API authentications per client IP (8.7): a brake on token guessing. */
export const API_FAIL_LIMITS: RateLimits = { perMinute: 30 };

// ── Per-user throttles on actions that call providers (final review I2) ────

/** Per-user budgets of the actions that spend provider quota or do heavy work. */
export const ACTION_LIMITS = {
  searchMedia: { perMinute: 60, perDay: 2000, noun: 'searches' },
  searchEverything: { perMinute: 20, perDay: 500, noun: 'searches' },
  lookupBookByIsbn: { perMinute: 20, perDay: 300, noun: 'ISBN lookups' },
  loadMoreBy: { perMinute: 20, perDay: 300 },
  franchiseMissing: { perMinute: 10, perDay: 100 },
  /** refreshRefList and createBuiltinRefList share one budget. */
  refList: { perMinute: 5, perDay: 30, noun: 'list refreshes' },
  addPastedRefItems: { perMinute: 5, perDay: 50 },
  /** Import budgets count ROWS (a call costs its row count): see takeActionCost. */
  matchImportRows: { perMinute: 600, perDay: 30_000, noun: 'import rows' },
  commitImportRows: { perMinute: 1200, perDay: 60_000, noun: 'import rows' },
  sendTestNotification: { perMinute: 5, perDay: 30, noun: 'test notifications' },
} satisfies Record<string, RateLimits>;

export type RatedAction = keyof typeof ACTION_LIMITS;

/**
 * Count one call of `action` by `userId`. Null when it fits; otherwise the
 * friendly message to show ("Too many searches. Try again in 12 s.").
 */
export function takeActionRate(action: RatedAction, userId: string, now?: number): string | null {
  const d = takeActionCost(action, userId, 1, now);
  return d.ok ? null : d.message;
}

/**
 * Count `cost` units (e.g. the rows of one import chunk) of `action` by
 * `userId` at once. The decision carries `retryAfterSec`, so a client can wait
 * and retry the same chunk instead of failing it.
 */
export function takeActionCost(action: RatedAction, userId: string, cost: number, now?: number): RateDecision {
  return takeRate(rateKey('action', action, userId), ACTION_LIMITS[action], now, cost);
}
