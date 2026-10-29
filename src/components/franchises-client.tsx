'use client';

import { useEffect, useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ImageOff, Layers, ListOrdered, Loader2, Plus, Radar, Wand2 } from 'lucide-react';

import { FranchiseDialog } from '@/components/franchise-dialog';
import { useDisplayTitle } from '@/components/prefs-provider';
import { nextInFranchise } from '@/lib/franchise/order';
import { GroupRating, groupCover, memberAverage } from '@/components/franchise-group';
import { SortableRankList, type RankRow } from '@/components/sortable-rank-list';
import { Button } from '@/components/ui/button';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { settle } from '@/lib/action-result';
import { detectFranchisesStep, saveFranchiseRanking } from '@/lib/actions/franchise';
import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import type { FranchiseWithMembers } from '@/lib/types';
import { cn } from '@/lib/utils';

type Tab = 'all' | 'ranking';
const isTab = (v: unknown): v is Tab => v === 'all' || v === 'ranking';

/** "4 anime · 1 manga · 1 movie" */
function breakdown(f: FranchiseWithMembers): string {
  const counts = new Map<CategorySlug, number>();
  for (const m of f.members) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([slug, n]) => {
      const c = CATEGORIES[slug];
      return `${n} ${(n === 1 ? c.singular : c.label).toLowerCase()}`;
    })
    .join(' · ');
}

function toRow(f: FranchiseWithMembers): RankRow {
  return { id: f.id, title: f.name, imageUrl: groupCover(f, f.members), subtitle: breakdown(f), rating: f.rating };
}

/** The Franchises page: every grouped IP, its own rating, and an IP ranking. */
export function FranchisesClient({ franchises }: { franchises: FranchiseWithMembers[] }) {
  const router = useRouter();
  const [tab, setTab] = usePersistentState<Tab>('hoard:franchises:tab', 'all', isTab);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = franchises.find((f) => f.id === selectedId) ?? null;
  const options = franchises.map((f) => ({ id: f.id, name: f.name }));

  // Ranking state (optimistic).
  const [ranked, setRanked] = useState(() => franchises.filter((f) => f.rankOrder != null));
  useEffect(() => setRanked(franchises.filter((f) => f.rankOrder != null)), [franchises]);
  const unranked = franchises
    .filter((f) => !ranked.some((r) => r.id === f.id))
    .sort((a, b) => (b.rating ?? memberAverage(b.members) ?? -1) - (a.rating ?? memberAverage(a.members) ?? -1));

  function persist(next: FranchiseWithMembers[]) {
    setRanked(next);
    startTransition(async () => {
      const res = await settle(saveFranchiseRanking(next.map((f) => f.id)));
      if (!res.ok) {
        toast.error(res.error ?? 'Could not save the ranking.');
        router.refresh();
      }
    });
  }
  const byId = new Map(franchises.map((f) => [f.id, f]));

  async function detect() {
    setDetecting(true);
    let total = 0;
    try {
      for (let step = 0; step < 30; step++) {
        const res = await settle(detectFranchisesStep());
        total += res.resolved ?? 0;
        if (!res.ok) {
          toast.error(res.error ?? 'Detection failed.');
          break;
        }
        if (res.error) toast.warning(res.error);
        setProgress(`Checked ${total} titles${res.remaining ? `, ${res.remaining} to go` : ''}…`);
        router.refresh();
        if (res.remaining === 0) {
          toast.success(`Done. ${res.groups} franchise${res.groups === 1 ? '' : 's'} in your hoard.`);
          break;
        }
      }
    } finally {
      setDetecting(false);
      setProgress(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-[var(--page-pad)] py-4 sm:py-6">
      {/* Stacked on phones, one row that never wraps from sm. */}
      <header className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Franchises</h1>
          <p className="text-sm text-muted-foreground">
            Seasons, movies, manga and games of one IP, grouped. Rate the IP as a
            whole without touching each title&apos;s own rating.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
          <Button variant="outline" onClick={detect} disabled={detecting}>
            {detecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />}
            Detect franchises
          </Button>
        </div>
      </header>

      <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
        {(
          [
            { id: 'all', label: 'All franchises', Icon: Layers },
            { id: 'ranking', label: 'Ranking', Icon: ListOrdered },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={cn(
              'inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors',
              tab === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {franchises.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Layers className="h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="font-medium">No franchises yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Run “Detect franchises” to group what you already track. New titles are
            grouped automatically when you add them.
          </p>
        </div>
      ) : tab === 'all' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {franchises.map((f) => {
            const cover = groupCover(f, f.members);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedId(f.id)}
                className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="relative aspect-[2/3] w-full bg-muted">
                  {cover ? (
                    <Image src={cover} alt={f.name} fill sizes="(max-width: 640px) 50vw, 20vw" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-8 w-8" aria-hidden />
                    </div>
                  )}
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
                    <Layers className="h-3 w-3" aria-hidden />
                    {f.members.length}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <h3 className="line-clamp-2 text-sm font-semibold leading-tight">{f.name}</h3>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{breakdown(f)}</p>
                  <NextUp franchise={f} />
                  <div className="mt-auto pt-1">
                    <GroupRating franchise={f} members={f.members} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="max-w-3xl space-y-8">
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Your top franchises</h2>
              {unranked.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => persist([...ranked, ...unranked])}
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Rank the rest by rating
                </Button>
              )}
            </div>
            {ranked.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Nothing ranked yet. Add franchises from the list below.
              </p>
            ) : (
              <SortableRankList
                items={ranked.map(toRow)}
                disabled={isPending}
                onReorder={(rows) =>
                  persist(rows.map((r) => byId.get(r.id)).filter((f): f is FranchiseWithMembers => !!f))
                }
                onRemove={(id) => persist(ranked.filter((f) => f.id !== id))}
              />
            )}
          </section>
          {unranked.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-muted-foreground">Not ranked yet · {unranked.length}</h2>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {unranked.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 rounded-lg border border-dashed border-border p-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{f.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{breakdown(f)}</span>
                    </span>
                    <Button variant="outline" size="sm" disabled={isPending} onClick={() => persist([...ranked, f])}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Rank
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <FranchiseDialog franchise={selected} all={options} onClose={() => setSelectedId(null)} />
    </div>
  );
}

/** "Next up: {title}" — the franchise's first title still to do (4.7). */
function NextUp({ franchise }: { franchise: FranchiseWithMembers }) {
  const titleOf = useDisplayTitle();
  const next = nextInFranchise(franchise.members);
  if (!next || franchise.members.length < 2) return null;
  return (
    <p className="line-clamp-2 text-xs">
      <span className="text-muted-foreground">Next up: </span>
      <span className="font-medium">{titleOf(next.media)}</span>
    </p>
  );
}
