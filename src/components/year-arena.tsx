'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Shuffle, Trophy } from 'lucide-react';

import { DuelCard } from '@/components/arena';
import { useDisplayTitle } from '@/components/prefs-provider';
import { Button } from '@/components/ui/button';
import { nextYearMatchup, submitYearDuel } from '@/lib/actions/year-arena';
import type { ActivityWithMedia, Matchup } from '@/lib/types';

/**
 * The "best of the year" Arena (spec 4.6): two titles finished in `year`,
 * pick the better one. Only the year's own Elo moves.
 */
export function YearArena({ year, initial }: { year: number; initial: Matchup | null }) {
  const [matchup, setMatchup] = useState<Matchup | null>(initial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const titleOf = useDisplayTitle();

  if (!matchup) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
        <Trophy className="h-10 w-10 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Not enough finishes in {year}</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Finish at least two titles in {year} (any section) and they can face each other here.
        </p>
      </div>
    );
  }

  function choose(winner: ActivityWithMedia, loser: ActivityWithMedia) {
    startTransition(async () => {
      const res = await submitYearDuel(year, winner.id, loser.id);
      if (!res.ok) {
        toast.error(res.error ?? 'Could not save the duel.');
        return;
      }
      setMatchup(res.next ?? null);
      toast.success(`"${titleOf(winner.media)}" wins the round.`);
      router.refresh();
    });
  }

  function shuffle() {
    startTransition(async () => setMatchup(await nextYearMatchup(year)));
  }

  const { a, b } = matchup;
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Which was better?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Both finished in {year}. Only this year&apos;s ranking changes.</p>
      </div>
      <div className="grid w-full grid-cols-2 gap-3 sm:gap-4">
        <DuelCard activity={a} disabled={isPending} onClick={() => choose(a, b)} />
        <DuelCard activity={b} disabled={isPending} onClick={() => choose(b, a)} />
      </div>
      <Button variant="outline" onClick={shuffle} disabled={isPending}>
        <Shuffle className="mr-2 h-4 w-4" aria-hidden />
        Shuffle / Skip
      </Button>
    </div>
  );
}
