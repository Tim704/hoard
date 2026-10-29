'use client';

// ───────────────────────────────────────────────────────────────────────────
//  The details' "More by the same people" (spec 5.10): closed by default and
//  loaded only when opened. Each title is an add row. Its own failures stay
//  inside the section (a friendly line), never breaking the dialog.
// ───────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { ChevronDown, Loader2, Users } from 'lucide-react';

import { AddRowList } from '@/components/add-row-list';
import { useAddRows } from '@/components/add-row';
import { Heading, LabelHeading, type HeadingLevel } from '@/components/heading';
import { settle } from '@/lib/action-result';
import { loadMoreBy } from '@/lib/actions/more-by';
import type { MoreByAnswer } from '@/lib/more-by';
import { cn } from '@/lib/utils';

/**
 * `headingLevel` (the title page): the toggle is that heading's content and
 * the people's groups are one level below; otherwise a plain toggle with h4s.
 */
export function MoreBySection({ activityId, headingLevel }: { activityId: string; headingLevel?: 2 | 3 }) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<MoreByAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const rows = useAddRows();
  const groupLevel: HeadingLevel = headingLevel ? ((headingLevel + 1) as HeadingLevel) : 4;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || answer || loading) return;
    setLoading(true);
    try {
      const res = await settle(loadMoreBy(activityId));
      setAnswer(
        res.ok && res.answer ? res.answer : { status: 'message', message: res.error ?? 'Could not load this right now.' },
      );
    } catch {
      setAnswer({ status: 'message', message: 'Could not load this right now.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-2">
      <LabelHeading level={headingLevel}>
        <button
          type="button"
          onClick={() => void toggle()}
          aria-expanded={open}
          className="flex w-full items-center gap-1.5 text-left text-sm font-medium"
        >
          <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          More by the same people
          <ChevronDown className={cn('ml-auto h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </LabelHeading>
      {open &&
        (loading || !answer ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Looking it up…
          </p>
        ) : answer.status === 'message' ? (
          <p className="text-xs text-muted-foreground">{answer.message}</p>
        ) : (
          <div className="space-y-4">
            {answer.groups.map((g) => (
              <div key={g.label} className="space-y-2">
                <Heading level={groupLevel} className="text-xs font-medium text-muted-foreground">
                  {g.label}
                </Heading>
                <AddRowList label={g.label} items={g.items} marks={{}} rows={rows} />
              </div>
            ))}
          </div>
        ))}
    </section>
  );
}
