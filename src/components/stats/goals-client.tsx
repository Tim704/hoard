'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Loader2, Pencil, Plus, Target, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createGoal, deleteGoal, updateGoalTarget } from '@/lib/actions/stats';
import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import {
  GOAL_METRICS,
  GOAL_TARGET_MAX,
  goalUnit,
  metricFits,
  metricLabel,
  type GoalMetric,
  type GoalProgress,
} from '@/lib/stats/goals';
import { HOURS_NOTE } from '@/lib/stats/measures';
import { cn } from '@/lib/utils';

const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-base sm:text-sm';

/** What a goal measures, in words ("Books · titles finished"). */
export function goalTitle(g: Pick<GoalProgress, 'category' | 'metric'>): string {
  const where = g.category ? CATEGORIES[g.category].label : 'All sections';
  return `${where} · ${metricLabel(g.metric).toLowerCase()}`;
}

/** A goal's progress bar (shared with the dashboard tile). */
export function GoalBar({ goal }: { goal: GoalProgress }) {
  const pct = Math.round(goal.share * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate">{goalTitle(goal)}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{goal.value.toLocaleString('en-US')}</span> /{' '}
          {goal.target.toLocaleString('en-US')} {goalUnit(goal.metric, goal.category, goal.target)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={goalTitle(goal)}
        aria-valuemin={0}
        aria-valuemax={goal.target}
        aria-valuenow={Math.min(goal.value, goal.target)}
        aria-valuetext={`${goal.value} of ${goal.target}${goal.done ? ', reached' : ''}`}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full', goal.done ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-[var(--viz-1)]')}
          style={{ width: `${Math.max(goal.value > 0 ? 2 : 0, pct)}%` }}
        />
      </div>
      {goal.done && (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" aria-hidden />
          Reached
        </p>
      )}
    </div>
  );
}

/** The Goals tab (spec 6.3): the year's goals with progress, edit, delete and add. */
export function GoalsClient({
  year,
  years,
  goals,
  sections,
}: {
  year: number;
  years: number[];
  goals: GoalProgress[];
  sections: CategorySlug[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState<string>('all');
  const [metric, setMetric] = useState<GoalMetric>('count');
  const [target, setTarget] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const cat = category === 'all' ? null : (category as CategorySlug);
  const metrics = GOAL_METRICS.filter((m) => metricFits(m, cat));

  function add(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createGoal({ year, category: cat, metric, target: target.trim() });
      if (!res.ok) {
        toast.error(res.error ?? 'Could not save the goal.');
        return;
      }
      setTarget('');
      toast.success('Goal added.');
      router.refresh();
    });
  }

  function saveTarget(id: string) {
    startTransition(async () => {
      const res = await updateGoalTarget(id, editValue.trim());
      if (!res.ok) {
        toast.error(res.error ?? 'Could not save the goal.');
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteGoal(id);
      if (!res.ok) {
        toast.error(res.error ?? 'Could not delete the goal.');
        return;
      }
      toast.success('Goal deleted.');
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Goal year" className="flex flex-wrap gap-1.5">
        {[...new Set([year, ...years])]
          .sort((a, b) => b - a)
          .map((y) => (
            <Link
              key={y}
              href={`/stats?tab=goals&year=${y}`}
              aria-current={y === year ? 'page' : undefined}
              className={cn(
                'rounded-md border px-2.5 py-1 text-sm font-medium tabular-nums transition-colors',
                y === year ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {y}
            </Link>
          ))}
      </nav>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Target className="h-4 w-4 text-muted-foreground" aria-hidden />
          Goals for {year}
        </h2>
        {goals.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No goals for {year} yet. Add one below.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {goals.map((g) => (
              <li key={g.id} className="space-y-2">
                <GoalBar goal={g} />
                {editing === g.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={GOAL_TARGET_MAX}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      aria-label="New target"
                      className="h-8 w-28 text-base sm:text-sm"
                      autoFocus
                    />
                    <Button size="sm" variant="outline" className="h-8" onClick={() => saveTarget(g.id)} disabled={isPending}>
                      <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(null)}>
                      <X className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={() => {
                        setEditing(g.id);
                        setEditValue(String(g.target));
                      }}
                    >
                      <Pencil className="mr-1 h-3 w-3" aria-hidden />
                      Change target
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => remove(g.id)}
                      disabled={isPending}
                      aria-label={`Delete the goal ${goalTitle(g)}`}
                    >
                      <Trash2 className="mr-1 h-3 w-3" aria-hidden />
                      Delete
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={add} className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">Add a goal for {year}</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Section</span>
            <select
              className={selectClass}
              value={category}
              onChange={(e) => {
                const next = e.target.value;
                setCategory(next);
                const c = next === 'all' ? null : (next as CategorySlug);
                if (!metricFits(metric, c)) setMetric('count');
              }}
            >
              <option value="all">All sections</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {CATEGORIES[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Measure</span>
            <select className={selectClass} value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric)}>
              {metrics.map((m) => (
                <option key={m} value={m}>
                  {m === 'count' && cat === 'games' ? 'Games beaten' : metricLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Target</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={GOAL_TARGET_MAX}
              required
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="50"
              className="h-9 text-base sm:text-sm"
            />
          </label>
          <Button type="submit" disabled={isPending || !target.trim()} className="h-9">
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Plus className="mr-2 h-4 w-4" aria-hidden />}
            Add goal
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Progress counts the titles finished in {year} (your diary), each once. Pages come from books; episodes from TV and
          anime. {HOURS_NOTE}
        </p>
      </form>
    </div>
  );
}
