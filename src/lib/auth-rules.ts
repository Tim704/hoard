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

/** Sign-in attempts per username+IP pair, and per IP. */
export const LOGIN_LIMITS: RateLimits = { perMinute: 10, perDay: 100 };
/**
 * A high global cap per username (all IPs together): slows a distributed
 * guess at one account without letting a single attacker lock its owner out.
 */
export const LOGIN_USER_LIMITS: RateLimits = { perMinute: 100, perDay: 1000 };
/** New accounts per IP: 5 an hour. */
export const REGISTER_LIMITS: RateLimits = { perMinute: 5, perHour: 5 };

const retryText = (sec: number) => (sec >= 120 ? `about ${Math.ceil(sec / 60)} minutes` : `${sec} s`);

/**
 * Count one sign-in attempt for `username` from `ip`. Null when allowed,
 * else the message. The tight budget is per username AND address (re-review
 * 3): someone guessing from one address can't lock the owner out from
 * theirs. Each address also has its own budget across usernames, and each
 * username a high global cap.
 */
export function takeLoginRate(username: string, ip: string, now?: number): string | null {
  const user = username.trim().toLowerCase();
  const byPair = takeRate(`login:pair:${user}:${ip}`, LOGIN_LIMITS, now);
  const byIp = takeRate(`login:ip:${ip}`, LOGIN_LIMITS, now);
  const byUser = takeRate(`login:user:${user}`, LOGIN_USER_LIMITS, now);
  const blocked = [byPair, byIp, byUser].find((d) => !d.ok);
  if (!blocked || blocked.ok) return null;
  return `Too many sign-in attempts. Try again in ${retryText(blocked.retryAfterSec)}.`;
}

/** Count one sign-up from `ip`. Null when allowed, else the message. */
export function takeRegisterRate(ip: string, now?: number): string | null {
  const d = takeRate(`register:ip:${ip}`, REGISTER_LIMITS, now);
  return d.ok ? null : `Too many new accounts from your address. Try again in ${retryText(d.retryAfterSec)}.`;
}
