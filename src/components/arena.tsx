'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ImageOff, Shuffle, Star, Swords } from 'lucide-react';

import type { CategorySlug } from '@/lib/categories';
import type { ActivityWithMedia, Matchup } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { nextMatchup, submitMatchup } from '@/lib/actions/arena';
import { useScoreFormat } from '@/components/prefs-provider';

interface ArenaProps {
  slug: CategorySlug;
  initial: Matchup | null;
}

/**
 * The hidden Elo Arena. Presents two equally-rated items and asks the user to
 * pick a winner; each pick nudges both items' Elo (persisted server-side) and
 * fetches a fresh matchup. The visible 1–10 rating stays put — Elo is the secret
 * tie-breaker that powers the dynamic ranking list.
 */
export function Arena({ slug, initial }: ArenaProps) {
  const [matchup, setMatchup] = useState<Matchup | null>(initial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { score } = useScoreFormat();

  // ── Empty state: not enough equally-rated items to form a duel. ────────────
  if (!matchup) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
        <Swords className="h-10 w-10 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">No duels available yet</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Put at least two items in your ranking, or give two items the same
          1–10 score, to start dueling.
        </p>
      </div>
    );
  }

  /** Record a winner, then swap in whatever the server hands back. */
  function choose(winner: ActivityWithMedia, loser: ActivityWithMedia) {
    startTransition(async () => {
      const next = await submitMatchup(slug, winner.id, loser.id);
      setMatchup(next);
      toast.success(`"${winner.media.title}" wins the round.`);
      router.refresh();
    });
  }

  /** Skip this pairing without scoring it. */
  function shuffle() {
    startTransition(async () => {
      const next = await nextMatchup(slug);
      setMatchup(next);
      router.refresh();
    });
  }

  const { rating, a, b } = matchup;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Which is better?</h2>
        {matchup.ranks ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Neighbours in tier {a.tier} (#{matchup.ranks[0]} vs #{matchup.ranks[1]}). The
            winner ends up on top.
          </p>
        ) : (
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
            Both scored {rating === 10 ? score(10) : `${score(rating)}–${score(rating == null ? null : rating + 0.9)}`}
          </p>
        )}
      </div>

      {/* Two columns even on phones so both contenders are glanceable at once. */}
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

interface DuelCardProps {
  activity: ActivityWithMedia;
  disabled: boolean;
  onClick: () => void;
}

/** A large, clickable contender card (poster + title + year). */
function DuelCard({ activity, disabled, onClick }: DuelCardProps) {
  const { media } = activity;
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
        {media.imageUrl ? (
          <Image
            src={media.imageUrl}
            alt={media.title}
            fill
            sizes="(max-width: 640px) 50vw, 300px"
            className="object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-10 w-10 text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>
      <div className="p-2 sm:p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug sm:text-base">
          {media.title}
        </p>
        {media.year != null && (
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{media.year}</p>
        )}
      </div>
    </button>
  );
}
