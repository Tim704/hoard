'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ListChecks, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setProgress } from '@/lib/actions/media';
import {
  parseProgressInput,
  progressFraction,
  progressShownByDefault,
  progressText,
  progressTotal,
  progressUnit,
  tracksProgress,
} from '@/lib/progress';
import { FINISHED_STATUSES, statusLabel } from '@/lib/status';
import type { ActivityWithMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Quick +1 taps are gathered for this long, then saved as one change. */
const TAP_BATCH_MS = 800;

interface ProgressFieldProps {
  activity: ActivityWithMedia;
  disabled?: boolean;
  /** Offered once progress reaches the total (status never changes on its own). */
  onMarkFinished: () => void;
  /**
   * Progress is computed elsewhere (a TV show's Seasons section): shown
   * read-only with this hint instead of the box and +1.
   */
  readOnlyHint?: string;
}

/**
 * Progress in the details dialog: a typed box (saved on blur / Enter) and a
 * +1 button (rapid taps are batched), each saving straight away as one
 * `progress` event. Render with `key={activity.id}`.
 */
export function ProgressField({ activity, disabled, onMarkFinished, readOnlyHint }: ProgressFieldProps) {
  const router = useRouter();
  const slug = activity.category;
  const total = progressTotal(activity);

  const [open, setOpen] = useState(() => progressShownByDefault(activity));
  const [value, setValue] = useState<number | null>(activity.progress);
  const [draft, setDraft] = useState(activity.progress?.toString() ?? '');

  const saved = useRef<number | null>(activity.progress); // last value on the server
  const latest = useRef<number | null>(activity.progress); // what the user sees
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Saves run one at a time, in order, so a +1 batch and a typed value can't
  // land out of order and leave a stale value (or event) behind.
  const queue = useRef<Promise<void>>(Promise.resolve());

  function persist(next: number | null): Promise<void> {
    queue.current = queue.current.then(() => save(next));
    return queue.current;
  }

  async function save(next: number | null) {
    if (next === saved.current) return;
    const prev = saved.current;
    saved.current = next;
    const res = await setProgress(activity.id, next).catch(() => ({ ok: false, error: undefined }));
    if (!res.ok) {
      saved.current = prev;
      // Only roll the box back if nothing newer was entered meanwhile.
      if (latest.current === next) {
        latest.current = prev;
        setValue(prev);
        setDraft(prev?.toString() ?? '');
      }
      toast.error(res.error ?? 'Could not save progress.');
      return;
    }
    router.refresh();
  }

  function flush() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    return persist(latest.current);
  }

  // Closing the dialog mid-batch still saves the last +1.
  useEffect(
    () => () => {
      if (timer.current) void flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function show(next: number | null) {
    latest.current = next;
    setValue(next);
    setDraft(next?.toString() ?? '');
  }

  function increment() {
    show((latest.current ?? 0) + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), TAP_BATCH_MS);
  }

  function commitDraft() {
    const parsed = parseProgressInput(draft);
    if (parsed === undefined) {
      setDraft(value?.toString() ?? '');
      return;
    }
    show(parsed);
    void flush();
  }

  if (!tracksProgress(slug)) return null;

  if (!open && !readOnlyHint) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        <ListChecks className="h-3.5 w-3.5" aria-hidden />
        Track progress
      </button>
    );
  }

  const fraction = progressFraction(value, total);
  const reached = total != null && value != null && value >= total;
  // Already finished (completed, retired or dropped): nothing to offer.
  const finished = FINISHED_STATUSES.includes(activity.status);
  const inputId = `progress-${activity.id}`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={readOnlyHint ? undefined : inputId} className="text-sm font-medium">
        Progress
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {readOnlyHint ? (
          <span className="text-sm tabular-nums">
            {progressText(slug, value ?? 0, total)}
            <span className="ml-2 text-xs text-muted-foreground">{readOnlyHint}</span>
          </span>
        ) : (
          <>
            <Input
              id={inputId}
              value={draft}
              inputMode="numeric"
              placeholder="0"
              disabled={disabled}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitDraft();
                }
              }}
              // text-base on phones stops iOS zooming the page on focus (<16px does).
              className="h-9 w-20 text-base tabular-nums sm:text-sm"
            />
            <span className="text-sm text-muted-foreground">
              {total != null ? `/ ${total} ${progressUnit(slug, total)}` : progressUnit(slug, value ?? 0)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={increment}
              disabled={disabled}
              aria-label={`Add one ${progressUnit(slug, 1)}`}
            >
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />1
            </Button>
          </>
        )}
        {reached && !finished && (
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={async () => {
              await flush();
              onMarkFinished();
            }}
          >
            <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
            Mark as {statusLabel('COMPLETED', slug)}
          </Button>
        )}
      </div>
      {fraction != null && <ProgressTrack fraction={fraction} />}
    </div>
  );
}

function ProgressTrack({ fraction, className }: { fraction: number; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)} aria-hidden>
      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${fraction * 100}%` }} />
    </div>
  );
}

/**
 * The bar on grid and list cards: only while the title is ongoing and some
 * progress is stored. Without a known total it shows the count alone.
 */
export function ProgressBar({ activity, className }: { activity: ActivityWithMedia; className?: string }) {
  if (activity.status !== 'CONSUMING' || activity.progress == null) return null;
  if (!tracksProgress(activity.category)) return null;
  const total = progressTotal(activity);
  const fraction = progressFraction(activity.progress, total);
  const text = progressText(activity.category, activity.progress, total);
  return (
    <div className={cn('space-y-1', className)}>
      {fraction != null && (
        <div
          role="progressbar"
          aria-label={text}
          aria-valuemin={0}
          aria-valuemax={total ?? undefined}
          aria-valuenow={activity.progress}
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${fraction * 100}%` }} />
        </div>
      )}
      <p className="text-[11px] tabular-nums text-muted-foreground">{text}</p>
    </div>
  );
}
