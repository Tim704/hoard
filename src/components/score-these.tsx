'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ImageOff, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { useDisplayTitle } from '@/components/prefs-provider';
import { RatingStep } from '@/components/rating-step';
import { StatusBadge } from '@/components/status-badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { updateActivity } from '@/lib/actions/media';
import type { CategorySlug } from '@/lib/categories';
import type { ActivityWithMedia } from '@/lib/types';
import { playedEnough, unscoredFinished } from '@/lib/unscored';

interface ScoreTheseProps {
  slug: CategorySlug;
  activities: ActivityWithMedia[];
  /** Open straight away (the tier list's tray links here with ?score=1). */
  defaultOpen?: boolean;
}

/**
 * "Score these · N" (spec 1.3): a banner on the section page when finished
 * titles have no score yet, opening a dialog that scores them one by one.
 * Skip only hides a title for this visit of the dialog.
 */
export function ScoreThese({ slug, activities, defaultOpen = false }: ScoreTheseProps) {
  const router = useRouter();
  const titleOf = useDisplayTitle();
  const items = useMemo(() => unscoredFinished(activities), [activities]);
  const [open, setOpen] = useState(defaultOpen);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<string | null>(null);

  // 8.1: games played 10 h or more on Steam count too.
  const kind = slug === 'games' ? 'finished or well-played' : 'finished';
  const hide = (id: string) => setHidden((prev) => new Set(prev).add(id));
  const shown = items.filter((a) => !hidden.has(a.id));

  function close() {
    setOpen(false);
    setHidden(new Set());
    // Drop ?score=1 so a refresh doesn't reopen it.
    if (defaultOpen) router.replace(`/${slug}`, { scroll: false });
  }

  async function score(a: ActivityWithMedia, rating: number) {
    setPending(a.id);
    try {
      const res = await updateActivity(a.id, { rating });
      if (res.ok) {
        hide(a.id);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not save the score.');
      }
    } finally {
      setPending(null);
    }
  }

  if (items.length === 0 && !open) return null;

  return (
    <>
      {items.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-left text-sm transition-colors hover:bg-amber-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">Score these · {items.length}</span>
            <span className="text-muted-foreground">
              {' '}
              {items.length === 1 ? `${kind} title has` : `${kind} titles have`} no score yet.
            </span>
          </span>
        </button>
      )}

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="flex max-h-[90dvh] max-w-full flex-col overflow-hidden p-4 sm:max-w-xl sm:p-6">
          <DialogHeader>
            <DialogTitle>Score these</DialogTitle>
            <DialogDescription>
              {slug === 'games' ? 'Finished (or played 10 h or more on Steam)' : 'Finished'}, but no score yet. Scores also suggest a tier on the tier list.
            </DialogDescription>
          </DialogHeader>

          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">All caught up.</p>
          ) : (
            <ul className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
              {shown.map((a) => {
                const title = titleOf(a.media);
                return (
                  <li key={a.id} className="space-y-2 rounded-lg border border-border p-2.5">
                    <div className="flex items-center gap-3">
                      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-muted ring-1 ring-border">
                        {a.media.imageUrl ? (
                          <Image src={a.media.imageUrl} alt="" fill sizes="40px" className="object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{title}</p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <StatusBadge status={a.status} slug={a.category} />
                          {a.media.year != null && <span>{a.media.year}</span>}
                          {playedEnough(a) && <span>played {Math.round((a.playtimeMinutes ?? 0) / 60)} h</span>}
                        </div>
                      </div>
                    </div>
                    <RatingStep
                      disabled={pending !== null}
                      onSave={(v) => void score(a, v)}
                      onSkip={() => hide(a.id)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
