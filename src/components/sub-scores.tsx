'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronDown, Loader2, SlidersHorizontal } from 'lucide-react';

import { useScoreFormat } from '@/components/prefs-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateActivity } from '@/lib/actions/media';
import { setSubScores } from '@/lib/actions/subscores';
import type { CategorySlug } from '@/lib/categories';
import { formatRating, parseRatingInput } from '@/lib/rating';
import { SUBSCORE_KEYS, SUBSCORE_LABELS, subScoreAverage, type SubScoreKey, type SubScores } from '@/lib/subscores';
import { cn } from '@/lib/utils';

interface SubScoresProps {
  activityId: string;
  slug: CategorySlug;
  initial: SubScores;
  disabled?: boolean;
  /** Called after "Use as score" saved the average as the main score. */
  onUseAsScore: (rating: number) => void;
}

/**
 * The details' optional sub-scores (spec 4.10): one 0–10 box per aspect of
 * the medium, saved on blur / Enter, with their average and "Use as score".
 * Collapsed until opened (open by default once something is scored).
 */
export function SubScoresSection({ activityId, slug, initial, disabled = false, onUseAsScore }: SubScoresProps) {
  const router = useRouter();
  const { scoreOutOf } = useScoreFormat();
  const keys = SUBSCORE_KEYS[slug];
  const [scores, setScores] = useState<SubScores>(initial);
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries(keys.map((k) => [k, initial[k] == null ? '' : formatRating(initial[k]!)])),
  );
  const [open, setOpen] = useState(Object.keys(initial).length > 0);
  const [saving, setSaving] = useState(false);
  const avg = subScoreAverage(scores);
  const busy = disabled || saving;

  async function commit(key: SubScoreKey) {
    const raw = (text[key] ?? '').trim();
    const value = raw === '' ? null : parseRatingInput(raw);
    if (raw !== '' && value === null) {
      setText((t) => ({ ...t, [key]: scores[key] == null ? '' : formatRating(scores[key]!) }));
      toast.error('Use a score from 0 to 10.');
      return;
    }
    if ((scores[key] ?? null) === value) {
      setText((t) => ({ ...t, [key]: value == null ? '' : formatRating(value) }));
      return;
    }
    const next: SubScores = { ...scores };
    if (value === null) delete next[key];
    else next[key] = value;
    const prev = scores;
    setScores(next);
    setText((t) => ({ ...t, [key]: value == null ? '' : formatRating(value) }));
    setSaving(true);
    try {
      const res = await setSubScores(activityId, next);
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      setScores(prev);
      setText((t) => ({ ...t, [key]: prev[key] == null ? '' : formatRating(prev[key]!) }));
      toast.error(err instanceof Error && err.message ? err.message : 'Could not save the sub-score.');
    } finally {
      setSaving(false);
    }
  }

  async function applyAverage() {
    if (avg == null) return;
    setSaving(true);
    try {
      const res = await updateActivity(activityId, { rating: avg });
      if (!res.ok) throw new Error(res.error);
      onUseAsScore(avg);
      toast.success(`Scored ${scoreOutOf(avg)}.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Could not save the score.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="flex-1">Sub-scores</span>
        {avg != null && <span className="text-xs font-normal text-muted-foreground">avg {scoreOutOf(avg)}</span>}
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {keys.map((key) => (
              <label key={key} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{SUBSCORE_LABELS[key]}</span>
                <Input
                  inputMode="decimal"
                  value={text[key] ?? ''}
                  placeholder="–"
                  disabled={busy}
                  aria-label={`${SUBSCORE_LABELS[key]} (0 to 10)`}
                  onChange={(e) => setText((t) => ({ ...t, [key]: e.target.value }))}
                  onBlur={() => void commit(key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void commit(key);
                    }
                  }}
                  className="h-8 w-16 text-center text-base tabular-nums sm:text-sm"
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {avg == null ? 'Score any aspect from 0 to 10.' : `Average ${scoreOutOf(avg)}`}
            </p>
            <Button type="button" variant="outline" size="sm" disabled={busy || avg == null} onClick={() => void applyAverage()}>
              {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />}
              Use as score
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
