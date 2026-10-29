'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock, Check, ImageOff } from 'lucide-react';

import { CountdownBadge } from '@/components/card-badges';
import { useDisplayTitle, useToday } from '@/components/prefs-provider';
import { RatingStep } from '@/components/rating-step';
import { SortableRankList, type RankRow } from '@/components/sortable-rank-list';
import { toastStatusChange } from '@/components/undo-toast';
import { updateActivity } from '@/lib/actions/media';
import { saveQueue } from '@/lib/actions/queue';
import type { CategorySlug } from '@/lib/categories';
import { mediaSubtitle } from '@/lib/media-meta';
import { mergeAvailableOrder, splitQueue } from '@/lib/queue';
import { formatYmd, isYmd } from '@/lib/release';
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
 * send it to the tier tray. Titles that aren't out yet (5.4) are listed
 * apart, soonest first; that split is a view only, so dragging reorders the
 * available titles inside the queue and the others keep their places.
 */
export function UpNext({ slug, initial, hints }: UpNextProps) {
  const titleOf = useDisplayTitle();
  const router = useRouter();
  const today = useToday() ?? '9999-12-31';
  const { available, notYet } = useMemo(() => splitQueue(initial, today), [initial, today]);
  const [rows, setRows] = useState<RankRow[]>(() => available.map((a) => toRow(a, slug, titleOf, hints)));
  const [ratingId, setRatingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Pick up server changes (e.g. after revalidation or adding titles).
  useEffect(() => {
    setRows(available.map((a) => toRow(a, slug, titleOf, hints)));
  }, [available, slug, titleOf, hints]);

  const reorder = async (next: RankRow[]) => {
    const prev = rowsRef.current;
    setRows(next);
    setPending(true);
    const fullOrder = mergeAvailableOrder(
      initial.map((a) => a.id),
      prev.map((r) => r.id),
      next.map((r) => r.id),
    );
    const res = await saveQueue(slug, fullOrder);
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

  if (rows.length === 0 && notYet.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nothing queued. Add something to your list and it will show up here.
      </p>
    );
  }

  const doneLabel = statusLabel('COMPLETED', slug);

  return (
    <div className="space-y-6">
      <section aria-labelledby="up-next-available" className="space-y-2">
        {notYet.length > 0 && (
          <h2 id="up-next-available" className="text-sm font-semibold text-muted-foreground">
            Available now
          </h2>
        )}
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nothing in the queue is out yet.
          </p>
        ) : (
          <AvailableList
            rows={rows}
            pending={pending}
            doneLabel={doneLabel}
            ratingId={ratingId}
            setRatingId={setRatingId}
            onReorder={reorder}
            onComplete={complete}
          />
        )}
      </section>
      {notYet.length > 0 && (
        <section aria-labelledby="up-next-not-yet" className="space-y-2">
          <h2 id="up-next-not-yet" className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <CalendarClock className="h-4 w-4" aria-hidden />
            Not out yet
          </h2>
          <ol className="flex flex-col gap-2">
            {notYet.map((a) => (
              <NotYetRow key={a.id} activity={a} title={titleOf(a.media)} />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/** A title that isn't out yet: read-only, with its date and countdown. */
function NotYetRow({ activity, title }: { activity: ActivityWithMedia; title: string }) {
  const { media } = activity;
  const when = isYmd(media.releaseDate) ? formatYmd(media.releaseDate) : media.year != null ? String(media.year) : null;
  return (
    <li className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-card/60 p-2 pr-3">
      <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-muted ring-1 ring-border">
        {media.imageUrl ? (
          <Image src={media.imageUrl} alt={title} fill sizes="44px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium leading-snug">{title}</p>
        {when && <p className="text-xs text-muted-foreground">Out {when}</p>}
        <CountdownBadge activity={activity} className="mt-1" />
      </div>
    </li>
  );
}

function AvailableList({
  rows,
  pending,
  doneLabel,
  ratingId,
  setRatingId,
  onReorder,
  onComplete,
}: {
  rows: RankRow[];
  pending: boolean;
  doneLabel: string;
  ratingId: string | null;
  setRatingId: (id: string | null) => void;
  onReorder: (next: RankRow[]) => void;
  onComplete: (row: RankRow, rating?: number) => void;
}) {
  const complete = onComplete;
  return (
    <SortableRankList
      items={rows}
      onReorder={onReorder}
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
