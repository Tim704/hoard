// ───────────────────────────────────────────────────────────────────────────
//  Search everything (spec 2.5): one query, every visible section's provider
//  in parallel, each with its own 6 s limit. Pure apart from the timers; the
//  search itself is passed in.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';
import type { NormalizedResult, SearchResponse } from '@/lib/types';

export const SECTION_TIMEOUT_MS = 6000;
/** Results kept per section (the dialog shows the best few of each). */
export const SECTION_RESULT_CAP = 8;

export type SectionOutcome =
  | { slug: CategorySlug; state: 'ok'; source: string; results: NormalizedResult[] }
  | { slug: CategorySlug; state: 'error'; source: string; message: string }
  | { slug: CategorySlug; state: 'timeout' };

const TIMED_OUT = Symbol('timeout');

/** `promise`, or TIMED_OUT after `ms` (the timer is always cleared). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Run `search` for every slug at once (Promise.allSettled), each cut off
 * after `ms`. One outcome per slug, in the given order: its results (capped),
 * its error, or "timed out".
 */
export async function searchSections(
  slugs: CategorySlug[],
  query: string,
  search: (slug: CategorySlug, query: string) => Promise<SearchResponse>,
  ms: number = SECTION_TIMEOUT_MS,
): Promise<SectionOutcome[]> {
  const settled = await Promise.allSettled(slugs.map((slug) => withTimeout(search(slug, query), ms)));
  return settled.map((s, i): SectionOutcome => {
    const slug = slugs[i];
    if (s.status === 'rejected') {
      return { slug, state: 'error', source: '', message: 'Search failed.' };
    }
    if (s.value === TIMED_OUT) return { slug, state: 'timeout' };
    const r = s.value;
    if (r.error) return { slug, state: 'error', source: r.source, message: r.error };
    return { slug, state: 'ok', source: r.source, results: r.results.slice(0, SECTION_RESULT_CAP) };
  });
}
