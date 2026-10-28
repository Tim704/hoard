'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check } from 'lucide-react';

import { useDisplayTitle } from '@/components/prefs-provider';
import { RatingStep } from '@/components/rating-step';
import { SortableRankList, type RankRow } from '@/components/sortable-rank-list';
import { toastStatusChange } from '@/components/undo-toast';
import { updateActivity } from '@/lib/actions/media';
import { saveQueue } from '@/lib/actions/queue';
import type { CategorySlug } from '@/lib/categories';
import { mediaSubtitle } from '@/lib/media-meta';
import { statusLabel } from '@/lib/status';
import type { ActivityWithMedia } from '@/lib/types';
import type { QueueHint } from '@/lib/franchise/order';

interface UpNextProps {
  slug: CategorySlug;
  initial: ActivityWithMedia[];
  /** Queued titles with an earlier unfinished title of their franchise (4.7). */
  hints?: Record<string, QueueHint>;
}

const toRow = (
  a: ActivityWithMedia,
  slug: CategorySlug,
  titleOf: (m: ActivityWithMedia['media']) => string,
  hints: Record<string, QueueHint> | undefined,
): RankRow => {
  const hint = hints && Object.hasOwn(hints, a.id) ? hints[a.id] : null;
  return {
    id: a.id,
    title: titleOf(a.media),
    imageUrl: a.media.imageUrl,
    subtitle: mediaSubtitle(a.media as never, slug),
    chip: hint ? `Next in ${hint.franchise}: ${hint.title}` : null,
  };
};

/**
 * The per-category "Up next" queue: planned items in the order you want to get
 * to them. Drag to reorder (saved immediately); mark one done to score it and
 * send it to the tier tray.
 */
export function UpNext({ slug, initial, hints }: UpNextProps) {
  const titleOf = useDisplayTitle();
  const router = useRouter();
  const [rows, setRows] = useState<RankRow[]>(() => initial.map((a) => toRow(a, slug, titleOf, hints)));
  const [ratingId, setRatingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Pick up server changes (e.g. after revalidation or adding titles).
  useEffect(() => {
    setRows(initial.map((a) => toRow(a, slug, titleOf, hints)));
  }, [initial, slug, titleOf, hints]);

  const reorder = async (next: RankRow[]) => {
    const prev = rowsRef.current;
    setRows(next);
    setPending(true);
    const res = await saveQueue(slug, next.map((r) => r.id));
    setPending(false);
    if (!res.ok) {
      setRows(prev);
      toast.error(res.error ?? 'Could not save the queue.');
    }
  };

  const complete = async (row: RankRow, rating?: number) => {
    const prev = rowsRef.current;
    const index = prev.findIndex((r) => r.id === row.id);
    setRatingId(null);
    setRows(prev.filter((r) => r.id !== row.id));
    setPending(true);
    const res = await updateActivity(
      row.id,
      rating === undefined ? { status: 'COMPLETED' } : { status: 'COMPLETED', rating },
    );
    setPending(false);
    if (!res.ok) {
      setRows((cur) => {
        const next = [...cur];
        next.splice(Math.min(Math.max(index, 0), next.length), 0, row);
        return next;
      });
      toast.error(res.error ?? 'Could not mark it done.');
      return;
    }
    toastStatusChange(
      `Marked “${row.title}” as ${statusLabel('COMPLETED', slug)}.`,
      row.id,
      res.previous,
      () => router.refresh(),
    );
  };

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nothing queued. Add something to your list and it will show up here.
      </p>
    );
  }

  const doneLabel = statusLabel('COMPLETED', slug);

  return (
    <SortableRankList
      items={rows}
      onReorder={reorder}
      disabled={pending}
      renderActions={(row) => (
        <>
          <button
            type="button"
            onClick={() => setRatingId(ratingId === row.id ? null : row.id)}
            aria-expanded={ratingId === row.id}
            aria-label={`${doneLabel}: ${row.title}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            {doneLabel}
          </button>
          {ratingId === row.id && (
            <div className="w-full border-t border-border pt-2">
              <RatingStep
                autoFocus
                disabled={pending}
                onSave={(v) => complete(row, v)}
                onSkip={() => complete(row)}
              />
            </div>
          )}
        </>
      )}
    />
  );
}
