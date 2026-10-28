'use client';

// The season tier page's client parts (spec 4.5): the generic tier board over
// a show's seasons, and a season Arena within that show.

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ImageOff, Shuffle, Star, Swords } from 'lucide-react';

import { useScoreFormat } from '@/components/prefs-provider';
import { ItemTierBoard } from '@/components/tier-board';
import { Button } from '@/components/ui/button';
import {
  acceptSeasonSuggestions,
  nextSeasonMatchup,
  saveSeasonTiers,
  submitSeasonMatchup,
} from '@/lib/actions/seasons';
import { formatYmd, isYmd } from '@/lib/release';
import type { SeasonItem, SeasonMatchup } from '@/lib/seasons';
import type { TierBoardData } from '@/lib/tiers';
import { cn } from '@/lib/utils';

function seasonSubtitle(s: SeasonItem): string {
  const eps =
    s.episodeCount != null ? `${s.watchedEpisodes}/${s.episodeCount} episodes` : `${s.watchedEpisodes} episodes`;
  const aired = s.airDate && isYmd(s.airDate) ? formatYmd(s.airDate) : null;
  return [aired, eps].filter(Boolean).join(' · ');
}

export function SeasonTierBoard({
  activityId,
  initial,
}: {
  activityId: string;
  initial: TierBoardData<SeasonItem>;
}) {
  return (
    <ItemTierBoard<SeasonItem>
      initial={initial}
      save={(placement, trayIds) => saveSeasonTiers(activityId, placement, trayIds)}
      acceptAll={() => acceptSeasonSuggestions(activityId)}
      view={(s) => ({ title: s.title, subtitle: seasonSubtitle(s), imageUrl: s.imageUrl })}
      emptyText="No seasons to tier yet — log some episodes in the show's Seasons section first."
    />
  );
}

/** Duels between seasons of one show; each pick updates both seasons' Elo. */
export function SeasonArena({ activityId, initial }: { activityId: string; initial: SeasonMatchup | null }) {
  const [matchup, setMatchup] = useState<SeasonMatchup | null>(initial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { scorePlain: score } = useScoreFormat();

  if (!matchup) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 p-8 text-center">
        <Swords className="h-10 w-10 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">No season duels yet</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Put two seasons in the same tier, or give two seasons the same whole score, to start
          dueling.
        </p>
      </div>
    );
  }

  function choose(winner: SeasonItem, loser: SeasonItem) {
    startTransition(async () => {
      try {
        const next = await submitSeasonMatchup(activityId, winner.id, loser.id);
        setMatchup(next);
        toast.success(`"${winner.title}" wins the round.`);
        router.refresh();
      } catch {
        toast.error('Could not record that duel.');
      }
    });
  }

  function shuffle() {
    startTransition(async () => {
      try {
        setMatchup(await nextSeasonMatchup(activityId));
      } catch {
        toast.error('Could not load another duel.');
      }
    });
  }

  const { rating, a, b } = matchup;
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Which season is better?</h2>
        {rating == null ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Neighbours in tier {a.tier}. The winner ends up on top.
          </p>
        ) : (
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
            Both scored {rating === 10 ? score(10) : `${score(rating)}–${score(rating + 0.9)}`}
          </p>
        )}
      </div>
      <div className="grid w-full grid-cols-2 gap-3 sm:gap-4">
        <SeasonCard season={a} disabled={isPending} onClick={() => choose(a, b)} />
        <SeasonCard season={b} disabled={isPending} onClick={() => choose(b, a)} />
      </div>
      <Button variant="outline" onClick={shuffle} disabled={isPending}>
        <Shuffle className="mr-2 h-4 w-4" aria-hidden />
        Shuffle / Skip
      </Button>
    </div>
  );
}

function SeasonCard({ season, disabled, onClick }: { season: SeasonItem; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition',
        'hover:border-primary hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      <div className="relative aspect-[2/3] w-full bg-muted">
        {season.imageUrl ? (
          <Image
            src={season.imageUrl}
            alt={season.title}
            fill
            sizes="(max-width: 640px) 50vw, 240px"
            className="object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-10 w-10 text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>
      <div className="p-2 sm:p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug sm:text-base">{season.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{seasonSubtitle(season)}</p>
      </div>
    </button>
  );
}

/** The show's seasons flattened S→F, with how often each has duelled. */
export function RankedSeasonList({ items }: { items: SeasonItem[] }) {
  const { scorePlain } = useScoreFormat();
  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold">Ranking</h3>
      <ol className="divide-y divide-border rounded-lg border border-border bg-card">
        {items.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
            {s.rating != null && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-amber-600 dark:text-amber-300">
                <Star className="h-3 w-3 fill-current" aria-hidden />
                {scorePlain(s.rating)}
              </span>
            )}
            <span className="shrink-0 text-xs text-muted-foreground">
              {s.tier} · {s.duels === 1 ? '1 duel' : `${s.duels} duels`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
