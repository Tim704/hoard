'use client';

import { useEffect, useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ImageOff, ListOrdered, Plus, Star, Wand2 } from 'lucide-react';

import { SortableRankList, type RankRow } from '@/components/sortable-rank-list';
import { StatusIcon } from '@/components/status-icon';
import { Button } from '@/components/ui/button';
import { saveRanking, seedRanking } from '@/lib/actions/ranking';
import type { CategorySlug } from '@/lib/categories';
import { formatRating } from '@/lib/rating';
import type { RankBoard as RankBoardData } from '@/lib/data';
import { mediaSubtitle } from '@/lib/media-meta';
import type { ActivityWithMedia } from '@/lib/types';

interface RankBoardProps {
  slug: CategorySlug;
  initial: RankBoardData;
}

function toRow(a: ActivityWithMedia): RankRow {
  return {
    id: a.id,
    title: a.media.title,
    imageUrl: a.media.imageUrl,
    subtitle: [a.media.year, mediaSubtitle(a.media, a.category)].filter(Boolean).join(' · '),
    rating: a.rating,
  };
}

/**
 * The manual ranking editor: a drag-and-drop list of ranked titles plus a tray
 * of rankable titles that are not placed yet. Every change saves immediately
 * (optimistically) through `saveRanking`.
 */
export function RankBoard({ slug, initial }: RankBoardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [ranked, setRanked] = useState<ActivityWithMedia[]>(initial.ranked);
  const [unranked, setUnranked] = useState<ActivityWithMedia[]>(initial.unranked);

  // Resync when the server sends fresh data (after seeding or a refresh).
  useEffect(() => {
    setRanked(initial.ranked);
    setUnranked(initial.unranked);
  }, [initial]);

  const byId = new Map([...ranked, ...unranked].map((a) => [a.id, a]));

  function persist(nextRanked: ActivityWithMedia[], nextUnranked: ActivityWithMedia[]) {
    setRanked(nextRanked);
    setUnranked(nextUnranked);
    startTransition(async () => {
      const res = await saveRanking(
        slug,
        nextRanked.map((a) => a.id),
      );
      if (!res.ok) {
        toast.error(res.error ?? 'Could not save the ranking.');
        router.refresh();
      }
    });
  }

  const reorder = (rows: RankRow[]) =>
    persist(
      rows.map((r) => byId.get(r.id)).filter((a): a is ActivityWithMedia => !!a),
      unranked,
    );

  const remove = (id: string) => {
    const item = byId.get(id);
    if (!item) return;
    persist(
      ranked.filter((a) => a.id !== id),
      [item, ...unranked],
    );
  };

  const add = (item: ActivityWithMedia, where: 'top' | 'bottom') =>
    persist(
      where === 'top' ? [item, ...ranked] : [...ranked, item],
      unranked.filter((a) => a.id !== item.id),
    );

  const seed = () =>
    startTransition(async () => {
      const res = await seedRanking(slug);
      if (res.ok) {
        toast.success('Ranked everything by rating. Drag to fine-tune.');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not rank by rating.');
      }
    });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ListOrdered className="h-5 w-5 text-muted-foreground" />
            My ranking
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {ranked.length}
            </span>
          </h2>
          {unranked.length > 0 && (
            <Button variant="outline" size="sm" onClick={seed} disabled={isPending}>
              <Wand2 className="mr-2 h-4 w-4" />
              Rank the rest by rating
            </Button>
          )}
        </div>

        {ranked.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nothing ranked yet. Add titles from the list below, or let ratings
            build a first draft you can drag around.
          </div>
        ) : (
          <SortableRankList
            items={ranked.map(toRow)}
            onReorder={reorder}
            onRemove={remove}
            disabled={isPending}
          />
        )}
        <p className="text-xs text-muted-foreground">
          Drag by the handle, or use the arrows. Changes save automatically.
        </p>
      </section>

      {unranked.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-muted-foreground">
            Not ranked yet · {unranked.length}
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {unranked.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-lg border border-dashed border-border p-2"
              >
                <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
                  {a.media.imageUrl ? (
                    <Image
                      src={a.media.imageUrl}
                      alt={a.media.title}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.media.title}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <StatusIcon status={a.status} className="h-3 w-3" />
                    {a.rating != null && (
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                        {formatRating(a.rating)}
                      </span>
                    )}
                    {a.media.year}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => add(a, 'top')}
                    disabled={isPending}
                    title="Add at the top"
                  >
                    Top
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => add(a, 'bottom')}
                    disabled={isPending}
                    title="Add at the bottom"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Rank
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
