// ───────────────────────────────────────────────────────────────────────────
//  Sign-in and sign-up rules (final review M5): username shape for NEW
//  accounts (existing usernames are untouched) and the per-username / per-IP
//  brakes on guessing passwords and mass sign-ups. Pure apart from the shared
//  in-process rate store.
// ───────────────────────────────────────────────────────────────────────────

import { takeRate, type RateLimits } from '@/lib/rate-limit';

/** New usernames: 3–32 characters of letters, digits, `_`, `.` and `-`. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,32}$/;

/** Why a new username is refused, or null when it is fine. */
export function usernameProblem(username: string): string | null {
  if (username.length < 3) return 'Username must be at least 3 characters.';
  if (username.length > 32) return 'Username must be at most 32 characters.';
  if (!USERNAME_PATTERN.test(username)) return 'Username may only use letters, digits, “_”, “.” and “-”.';
  return null;
}

/** Sign-in attempts, per username and per IP. */
export const LOGIN_LIMITS: RateLimits = { perMinute: 10, perDay: 100 };
/** New accounts per IP: 5 an hour. */
export const REGISTER_LIMITS: RateLimits = { perMinute: 5, perHour: 5 };

const retryText = (sec: number) => (sec >= 120 ? `about ${Math.ceil(sec / 60)} minutes` : `${sec} s`);

/**
 * Count one sign-in attempt for `username` from `ip`. Null when allowed,
 * else the message. Both budgets are charged, so neither a single account
 * nor a single address can be hammered.
 */
export function takeLoginRate(username: string, ip: string, now?: number): string | null {
  const byUser = takeRate(`login:user:${username.trim().toLowerCase()}`, LOGIN_LIMITS, now);
  const byIp = takeRate(`login:ip:${ip}`, LOGIN_LIMITS, now);
  const blocked = [byUser, byIp].find((d) => !d.ok);
  if (!blocked || blocked.ok) return null;
  return `Too many sign-in attempts. Try again in ${retryText(blocked.retryAfterSec)}.`;
}

/** Count one sign-up from `ip`. Null when allowed, else the message. */
export function takeRegisterRate(ip: string, now?: number): string | null {
  const d = takeRate(`register:ip:${ip}`, REGISTER_LIMITS, now);
  return d.ok ? null : `Too many new accounts from your address. Try again in ${retryText(d.retryAfterSec)}.`;
}
