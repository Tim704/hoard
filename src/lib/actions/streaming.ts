'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Where to stream (5.1) server actions. Both read only the caller's own
//  activities (ownership as in media.ts) and look providers up lazily, at
//  most WATCH_BATCH_LIMIT titles per call, through the 7-day cache.
// ───────────────────────────────────────────────────────────────────────────

import { CATEGORY_LIST, type CategorySlug } from '@/lib/categories';
import { getPrefs } from '@/lib/data-prefs';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import {
  WATCH_BATCH_LIMIT,
  isMyService,
  isStreamable,
  mineFirst,
  myStreamOffers,
  type WatchOffer,
  type WatchProviders,
} from '@/lib/streaming';
import type { ActionResult } from '@/lib/types';
import { getProviderOptions, lookupWatchProviders, serviceNames } from '@/lib/watch-providers';
import { publicError } from '@/lib/action-error';

/** The caller's activities among `ids` (streamable sections only) with their externalId. */
async function ownTitles(userId: string, ids: string[]) {
  const include = Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, { select: { externalId: true } }]));
  const rows = await prisma.userMediaActivity.findMany({
    where: { userId, id: { in: ids } },
    include: include as never,
  });
  const out: { id: string; slug: CategorySlug; externalId: string }[] = [];
  for (const row of rows as unknown as Array<Record<string, unknown> & { id: string; category: string }>) {
    const cat = CATEGORY_LIST.find((c) => c.dbCategory === row.category);
    const media = cat ? (row[cat.prismaModel] as { externalId?: string } | null) : null;
    if (cat && media?.externalId && isStreamable(cat.slug)) {
      out.push({ id: row.id, slug: cat.slug, externalId: media.externalId });
    }
  }
  return out;
}

function cleanIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 100))].slice(
    0,
    WATCH_BATCH_LIMIT,
  );
}

/**
 * The badges for a batch of visible rows (Up next, the tonight picker,
 * Watch together): for each activity id, the stream offers that are on the
 * caller's services. Titles on none of them (or not looked up) are left out.
 * With no services chosen this answers at once, without any lookups.
 */
export async function loadStreamingBadges(
  activityIds: string[],
): Promise<ActionResult & { badges?: Record<string, WatchOffer[]>; hasServices?: boolean }> {
  try {
    const user = await requireUser();
    const prefs = await getPrefs(user.id);
    if (prefs.streamingServices.length === 0) return { ok: true, badges: {}, hasServices: false };
    const titles = await ownTitles(user.id, cleanIds(activityIds));
    const [lookups, names] = await Promise.all([
      lookupWatchProviders(titles, prefs.region),
      serviceNames(prefs.streamingServices, prefs.region),
    ]);
    const badges: Record<string, WatchOffer[]> = {};
    titles.forEach((t, i) => {
      const l = lookups[i];
      if (l.status !== 'ok') return;
      const mine = myStreamOffers(l.providers, prefs.streamingServices, names);
      if (mine.length) badges[t.id] = mine;
    });
    return { ok: true, badges, hasServices: true };
  } catch (err) {
    return { ok: false, error: publicError(err, 'Could not load streaming info.') };
  }
}

export type WhereToWatch =
  | { status: 'ok'; providers: WatchProviders; mine: string[] }
  | { status: 'not-configured' | 'no-region' | 'unavailable' | 'none' };

/**
 * Every provider for one title (the details' "Where to watch"), your
 * services first; `mine` lists the names of the offers that are yours.
 */
export async function loadWhereToWatch(activityId: string): Promise<ActionResult & { result?: WhereToWatch }> {
  try {
    const user = await requireUser();
    const [title] = await ownTitles(user.id, cleanIds([activityId]));
    if (!title) return { ok: true, result: { status: 'none' } };
    const prefs = await getPrefs(user.id);
    const [[lookup], names] = await Promise.all([
      lookupWatchProviders([title], prefs.region),
      serviceNames(prefs.streamingServices, prefs.region),
    ]);
    if (lookup.status !== 'ok') return { ok: true, result: lookup };
    const providers = mineFirst(lookup.providers, prefs.streamingServices, names);
    const mine = [...providers.stream, ...providers.rent, ...providers.buy]
      .filter((o) => isMyService(o, prefs.streamingServices, names))
      .map((o) => o.name);
    return { ok: true, result: { status: 'ok', providers, mine: [...new Set(mine)] } };
  } catch (err) {
    return { ok: false, error: publicError(err, 'Could not load where to watch.') };
  }
}

/** The services of the caller's region for the Settings picker (cached 7 days; static fallback). */
export async function loadProviderOptions(): Promise<
  ActionResult & { options?: { id: number; name: string; logo: string | null }[]; source?: 'tmdb' | 'fallback' }
> {
  try {
    const user = await requireUser();
    const prefs = await getPrefs(user.id);
    const { options, source } = await getProviderOptions(prefs.region);
    return { ok: true, options, source };
  } catch (err) {
    return { ok: false, error: publicError(err, 'Could not load the services.') };
  }
}
