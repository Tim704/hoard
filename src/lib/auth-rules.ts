// ───────────────────────────────────────────────────────────────────────────
//  Sign-in and sign-up rules (final review M5): username shape for NEW
//  accounts (existing usernames are untouched) and the per-username / per-IP
//  brakes on guessing passwords and mass sign-ups. Pure apart from the shared
//  in-process rate store.
// ───────────────────────────────────────────────────────────────────────────

import { rateKey, takeAllRates, takeRate, type RateLimits } from '@/lib/rate-limit';

/** New usernames: 3–32 characters of letters, digits, `_`, `.` and `-`. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,32}$/;

/** Why a new username is refused, or null when it is fine. */
export function usernameProblem(username: string): string | null {
  if (username.length < 3) return 'Username must be at least 3 characters.';
  if (username.length > 32) return 'Username must be at most 32 characters.';
  if (!USERNAME_PATTERN.test(username)) return 'Username may only use letters, digits, “_”, “.” and “-”.';
  return null;
}

/** Sign-in attempts per username+IP pair, and per IP. (No global per-username cap: it would let one address lock an owner out everywhere.) */
export const LOGIN_LIMITS: RateLimits = { perMinute: 10, perDay: 100 };
/** New accounts per IP: 5 an hour. */
export const REGISTER_LIMITS: RateLimits = { perMinute: 5, perHour: 5 };

const retryText = (sec: number) => (sec >= 120 ? `about ${Math.ceil(sec / 60)} minutes` : `${sec} s`);

/**
 * Count one sign-in attempt for `username` from `ip`. Null when allowed,
 * else the message. Two budgets: per username AND address, and per address
 * across usernames. Someone guessing from one address can't lock the owner
 * out from theirs. Atomic: a refused attempt charges neither budget.
 */
export function takeLoginRate(username: string, ip: string, now?: number): string | null {
  const user = username.trim().toLowerCase();
  const d = takeAllRates(
    [
      { key: rateKey('login', 'pair', user, ip), limits: LOGIN_LIMITS },
      { key: rateKey('login', 'ip', ip), limits: LOGIN_LIMITS },
    ],
    now,
  );
  return d.ok ? null : `Too many sign-in attempts. Try again in ${retryText(d.retryAfterSec)}.`;
}

/** Count one sign-up from `ip`. Null when allowed, else the message. */
export function takeRegisterRate(ip: string, now?: number): string | null {
  const d = takeRate(rateKey('register', 'ip', ip), REGISTER_LIMITS, now);
  return d.ok ? null : `Too many new accounts from your address. Try again in ${retryText(d.retryAfterSec)}.`;
}
