// ───────────────────────────────────────────────────────────────────────────
//  Calendar feed tokens (spec 5.6): 144 random bits, base64url — the same
//  generator as share links. Stored in prefs.calendarToken; regenerating
//  replaces it, so the old feed URL stops working at once. Pure.
// ───────────────────────────────────────────────────────────────────────────

import { publicBaseUrl } from '@/lib/public-url';
import { newShareToken } from '@/lib/share';

export function newCalendarToken(): string {
  return newShareToken();
}

/** Whether a string can be a token at all (checked before any database read). */
export function isCalendarTokenShape(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(v);
}

/** The feed's public address. */
export function calendarFeedUrl(token: string): string {
  return `${publicBaseUrl()}/api/ical/${token}.ics`;
}
