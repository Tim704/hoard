'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Settings server actions. `updatePrefs` validates a partial patch strictly
//  (PrefsPatchSchema) and merges it over the stored, parsed prefs, so a bad
//  stored value can never block saving the rest.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { changePrefs } from '@/lib/data-prefs';
import {
  PrefsPatchSchema,
  applyPrefsPatch,
  detectedPrefs,
  type PrefsPatch,
} from '@/lib/prefs';
import { requireUser } from '@/lib/session';
import { countryForTimeZone } from '@/lib/timezones';
import type { ActionResult } from '@/lib/types';
import { publicError } from '@/lib/action-error';

/** Region used when the browser's zone is unknown or UTC-like (the owner's). */
const FALLBACK_REGION = 'DE';

// Score format and hidden sections affect every page under the (app) layout.
const revalidateAll = () => revalidatePath('/', 'layout');

/** Save some settings. Unknown keys are dropped; invalid values are rejected. */
export async function updatePrefs(patch: PrefsPatch): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = PrefsPatchSchema.safeParse(patch);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid settings.' };
    }
    // Locked read-modify-write: a concurrent save can't be lost (changePrefs).
    await changePrefs(user.id, (current) => applyPrefsPatch(current, parsed.data));
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: publicError(err, 'Could not save settings.') };
  }
}

/**
 * The one-time automatic detection: fill the region (and the time zone, if
 * unset) from the browser's IANA time zone. Runs only while the region was
 * never detected or chosen (see detectedPrefs). No location API (spec G3).
 */
export async function detectRegion(
  browserTimeZone: string,
): Promise<ActionResult & { region?: string }> {
  try {
    const user = await requireUser();
    const tz = typeof browserTimeZone === 'string' ? browserTimeZone.slice(0, 64) : '';
    const { prefs, changed } = await changePrefs(user.id, (current) =>
      detectedPrefs(current, tz, countryForTimeZone, FALLBACK_REGION),
    );
    if (changed) revalidateAll();
    return { ok: true, region: prefs.region ?? undefined };
  } catch (err) {
    return { ok: false, error: publicError(err, 'Could not detect region.') };
  }
}
