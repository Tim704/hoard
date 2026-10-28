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
}

/** The AI features' shared budget per user. */
export const AI_LIMITS: RateLimits = { perMinute: 10, perDay: 100 };

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
export function checkRate(stamps: number[], limits: RateLimits, now: number): RateDecision {
  // Keep only as much history as the longest window needs.
  const horizon = limits.perDay != null ? DAY : limits.perHour != null ? HOUR : MINUTE;
  const recent = stamps.filter((t) => t > now - horizon && t <= now);
  const lastMinute = recent.filter((t) => t > now - MINUTE);
  if (lastMinute.length >= limits.perMinute) {
    const retryAfterSec = Math.max(1, Math.ceil((lastMinute[0] + MINUTE - now) / 1000));
    return { ok: false, stamps: recent, retryAfterSec, message: `Too many AI requests. Try again in ${retryAfterSec} s.` };
  }
  if (limits.perHour != null) {
    const lastHour = recent.filter((t) => t > now - HOUR);
    if (lastHour.length >= limits.perHour) {
      const retryAfterSec = Math.max(1, Math.ceil((lastHour[0] + HOUR - now) / 1000));
      const minutes = Math.ceil(retryAfterSec / 60);
      return {
        ok: false,
        stamps: recent,
        retryAfterSec,
        message: `Too many requests. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      };
    }
  }
  if (limits.perDay != null && recent.length >= limits.perDay) {
    const retryAfterSec = Math.max(1, Math.ceil((recent[0] + DAY - now) / 1000));
    const hours = Math.ceil(retryAfterSec / 3600);
    return {
      ok: false,
      stamps: recent,
      retryAfterSec,
      message: `You've used today's ${limits.perDay} AI requests. Try again in about ${hours} hour${hours === 1 ? '' : 's'}.`,
    };
  }
  return { ok: true, stamps: [...recent, now] };
}

type Store = Map<string, number[]>;
const globalStore = globalThis as unknown as { __hoardRateLimits?: Store };

function store(): Store {
  if (!globalStore.__hoardRateLimits) globalStore.__hoardRateLimits = new Map();
  return globalStore.__hoardRateLimits;
}

/** Count one call against `key` if it fits `limits` (the in-process store). */
export function takeRate(key: string, limits: RateLimits, now: number = Date.now()): RateDecision {
  const s = store();
  const decision = checkRate(s.get(key) ?? [], limits, now);
  if (decision.stamps.length) s.set(key, decision.stamps);
  else s.delete(key);
  return decision;
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
