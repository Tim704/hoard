import Image from 'next/image';
import Link from 'next/link';
import { ImageOff, Tag, X } from 'lucide-react';

import { MediaTitle } from '@/components/prefs-provider';
import { StatusBadge } from '@/components/status-badge';
import { TitleLink } from '@/components/title/title-link';
import { CATEGORIES, NAV_ORDER } from '@/lib/categories';
import { getMyTags, getTaggedActivities } from '@/lib/data-tags';
import { requireUser } from '@/lib/session';
import { normalizeTags, tagKey } from '@/lib/tags';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Tags · Hoard' };

const tagHref = (tags: string[]) =>
  tags.length ? `/tags?${tags.map((t) => `tag=${encodeURIComponent(t)}`).join('&')}` : '/tags';

/**
 * Every tag you use (spec 4.2), with how many titles carry it in each
 * section. A tag opens the titles that carry it across every section (pick
 * more to narrow: AND); the section counts open that section filtered.
 */
export default async function TagsPage({ searchParams }: { searchParams: { tag?: string | string[] } }) {
  const user = await requireUser();
  const selected = normalizeTags([searchParams.tag ?? []].flat());
  const [tags, tagged] = await Promise.all([getMyTags(user.id), getTaggedActivities(user.id, selected)]);
  const isSelected = (t: string) => selected.some((s) => tagKey(s) === tagKey(t));

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-[var(--page-pad)] py-4 sm:py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Tags</h1>
        <p className="text-sm text-muted-foreground">
          Your own labels across every section. Add them in a title&apos;s details.
        </p>
      </header>

      {tags.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Tag className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">No tags yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Open any title and type a tag under “Tags”, such as “comfort” or “reread”.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {tags.map((t) => {
            const on = isSelected(t.tag);
            const next = on ? selected.filter((s) => tagKey(s) !== tagKey(t.tag)) : [...selected, t.tag];
            return (
              <li
                key={t.tag}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border border-border bg-card p-3',
                  on && 'border-primary/60 bg-accent/40',
                )}
              >
                <Link
                  href={tagHref(next)}
                  aria-current={on ? 'true' : undefined}
                  className="flex items-center justify-between gap-2 font-medium hover:underline"
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    {on ? <X className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                    <span className="truncate">{t.tag}</span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{t.count}</span>
                </Link>
                <div className="flex flex-wrap gap-1.5">
                  {NAV_ORDER.filter((slug) => t.bySection[slug]).map((slug) => (
                    <Link
                      key={slug}
                      href={`/${slug}?tag=${encodeURIComponent(t.tag)}`}
                      className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {CATEGORIES[slug].label} · {t.bySection[slug]}
                    </Link>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selected.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Tagged {selected.map((s) => `“${s}”`).join(' and ')} · {tagged.length}
          </h2>
          {tagged.length === 0 ? (
            <p className="text-sm text-muted-foreground">No title has all of these tags.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {tagged.map((a) => (
                <li key={a.id}>
                  <TitleLink
                    slug={a.category}
                    id={a.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-2 transition hover:border-primary/60"
                  >
                    <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
                      {a.media.imageUrl ? (
                        <Image src={a.media.imageUrl} alt="" fill sizes="40px" className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        <MediaTitle media={a.media} />
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {CATEGORIES[a.category].label}
                        {a.media.year != null ? ` · ${a.media.year}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={a.status} slug={a.category} />
                  </TitleLink>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
