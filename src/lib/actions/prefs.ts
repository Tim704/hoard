'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Settings server actions. `updatePrefs` validates a partial patch strictly
//  (PrefsPatchSchema) and merges it over the stored, parsed prefs, so a bad
//  stored value can never block saving the rest.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { getPrefs } from '@/lib/data-prefs';
import { PrefsPatchSchema, type Prefs, type PrefsPatch } from '@/lib/prefs';
import { requireUser } from '@/lib/session';
import { countryForTimeZone, isValidTimeZone } from '@/lib/timezones';
import type { ActionResult } from '@/lib/types';

/** Region used when the browser's zone is unknown or UTC-like (the owner's). */
const FALLBACK_REGION = 'DE';

async function writePrefs(userId: string, next: Prefs): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { prefs: next } });
  // Score format and hidden sections affect every page under the (app) layout.
  revalidatePath('/', 'layout');
}

/** Save some settings. Unknown keys are dropped; invalid values are rejected. */
export async function updatePrefs(patch: PrefsPatch): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = PrefsPatchSchema.safeParse(patch);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid settings.' };
    }
    const current = await getPrefs(user.id);
    await writePrefs(user.id, { ...current, ...parsed.data });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save settings.' };
  }
}

/**
 * Fill in the region (and the time zone) from the browser's IANA time zone,
 * but only where they are still unset: an explicit choice is never overwritten.
 * No location API is involved (spec G3).
 */
export async function detectRegion(
  browserTimeZone: string,
): Promise<ActionResult & { region?: string }> {
  try {
    const user = await requireUser();
    const tz = typeof browserTimeZone === 'string' ? browserTimeZone.slice(0, 64) : '';
    const current = await getPrefs(user.id);
    if (current.region && current.timeZone) return { ok: true, region: current.region };

    const next = { ...current };
    if (!next.region) next.region = countryForTimeZone(tz) ?? FALLBACK_REGION;
    if (!next.timeZone && isValidTimeZone(tz)) next.timeZone = tz;
    await writePrefs(user.id, next);
    return { ok: true, region: next.region ?? undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not detect region.' };
  }
}
