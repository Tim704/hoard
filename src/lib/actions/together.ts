'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Watch together (5.8). The gate is re-checked here on every call (both
//  users must have compareOptIn), whatever the page showed; see
//  src/lib/data-together.ts for what may and may not be returned.
// ───────────────────────────────────────────────────────────────────────────

import { isCategorySlug, type CategorySlug } from '@/lib/categories';
import { compareQueues, type TogetherItem } from '@/lib/data-together';
import { requireUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

export async function compareWith(
  username: string,
  sections: string[],
): Promise<ActionResult & { items?: TogetherItem[] }> {
  try {
    const user = await requireUser();
    const slugs = (Array.isArray(sections) ? sections : []).filter(
      (s): s is CategorySlug => typeof s === 'string' && isCategorySlug(s),
    );
    const res = await compareQueues(user.id, String(username ?? ''), slugs);
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.reason === 'me-off'
            ? 'Turn on “Let other users compare with me” in Settings first.'
            : 'That user isn’t available to compare with.',
      };
    }
    return { ok: true, items: res.items };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not compare.' };
  }
}
