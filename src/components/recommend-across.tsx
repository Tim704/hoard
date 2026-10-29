'use client';

import { useState, useTransition } from 'react';
import { Loader2, Search, Wand2 } from 'lucide-react';

import { HeaderButton } from '@/components/dashboard/header-button';
import { useGlobalSearch } from '@/components/global-search';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { recommendAcrossMedia } from '@/lib/actions/taste';
import { CATEGORIES } from '@/lib/categories';
import type { Recommendation } from '@/lib/recommend';

/**
 * "Recommend across media" (spec 7.1): asks the AI for a few picks from your
 * S/A favourites and taste profile, shown as cards. "Find it" opens Search
 * everything (2.5) with the title filled in. `header`: the dashboard header's
 * button (HeaderButton: an icon where the layout or the width calls for one).
 */
export function RecommendAcrossButton({ className, header = false }: { className?: string; header?: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Recommendation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { openSearch } = useGlobalSearch();

  function run() {
    setItems([]);
    setError(null);
    setOpen(true);
    startTransition(async () => {
      try {
        const res = await recommendAcrossMedia();
        if (res.ok) setItems(res.items);
        else setError(res.error);
      } catch {
        setError('Recommendations are unavailable right now. Try again later.');
      }
    });
  }

  function findIt(title: string) {
    setOpen(false);
    openSearch(title);
  }

  return (
    <>
      {header ? (
        <HeaderButton icon={Wand2} label="Recommend across media" labelAt="lg" onClick={run} disabled={pending} className={className} />
      ) : (
        <Button type="button" variant="outline" onClick={run} disabled={pending} className={className}>
          <Wand2 className="mr-2 h-4 w-4" aria-hidden />
          Recommend across media
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Picks across media</DialogTitle>
            <DialogDescription>From your S and A tier favourites and your taste profile.</DialogDescription>
          </DialogHeader>
          {pending ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Thinking about what you&rsquo;d love next…
            </p>
          ) : error ? (
            <p className="py-4 text-sm text-rose-500 dark:text-rose-400">{error}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {items.map((r) => (
                <li
                  key={`${r.category}:${r.title}`}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {CATEGORIES[r.category].singular}
                    </p>
                    <p className="font-semibold leading-snug">
                      {r.title}
                      {r.year != null && <span className="font-normal text-muted-foreground"> ({r.year})</span>}
                    </p>
                  </div>
                  <p className="flex-1 text-sm text-muted-foreground">{r.because}</p>
                  <Button type="button" size="sm" variant="secondary" className="self-start" onClick={() => findIt(r.title)}>
                    <Search className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Find it
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
