'use client';

// "Add missing titles" (spec 2.10), inside the franchise dialog: the entries
// of the IP the user doesn't have yet (AniList relations, the TMDB
// collection, the IGDB franchise), ticked when there are at most 10, added as
// Done or Want (Want by default) through the import pipeline
// (`commitImportRows`, source "franchise"), then pinned to this franchise.

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ImageOff, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { useDisplayTitle } from '@/components/prefs-provider';
import { Button } from '@/components/ui/button';
import { addToFranchise, franchiseMissing, type MissingGroup } from '@/lib/actions/franchise';
import { commitImportRows, finishImport } from '@/lib/actions/import';
import { CATEGORIES } from '@/lib/categories';
import type { MissingTitle } from '@/lib/franchise/missing';
import { initialTicked } from '@/lib/franchise/missing-pick';
import { chunk, chunkCommitRows } from '@/lib/import/review';
import { COMMIT_CHUNK, type CommitRow } from '@/lib/import/types';
import { statusLabel } from '@/lib/status';

const keyOf = (t: MissingTitle) => `${t.slug}|${t.result.externalId}`;


export function FranchiseMissing({ franchiseId, onBack }: { franchiseId: string; onBack: () => void }) {
  const router = useRouter();
  const titleOf = useDisplayTitle();
  const [groups, setGroups] = useState<MissingGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  // Want (Planned) by default: these are titles the user hasn't logged yet.
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    franchiseMissing(franchiseId)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.groups) {
          setError(res.error ?? 'Could not look up the missing titles.');
          return;
        }
        setGroups(res.groups);
        // A short list starts ticked; a long one (a sprawling IP) starts empty.
        setTicked(initialTicked(res.groups.flatMap((g) => g.titles.map(keyOf))));
      })
      .catch(() => !cancelled && setError('Could not look up the missing titles.'));
    return () => {
      cancelled = true;
    };
  }, [franchiseId]);

  const titles = useMemo(() => (groups ?? []).flatMap((g) => g.titles), [groups]);
  const chosen = titles.filter((t) => ticked.has(keyOf(t)));
  const busy = progress !== null;
  const slugs = [...new Set(titles.map((t) => t.slug))];
  const doneLabel = slugs.length === 1 ? statusLabel('COMPLETED', slugs[0]) : 'Done';

  const toggle = (k: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  async function add() {
    if (busy || chosen.length === 0) return;
    const rows: CommitRow[] = chosen.map((t) => ({
      category: t.slug,
      source: 'franchise',
      result: t.result,
      status: done ? 'COMPLETED' : 'PLANNED',
    }));
    let added: string[] = [];
    let failed = 0;
    try {
      let n = 0;
      setProgress(`Adding 0 of ${rows.length}…`);
      for (const part of chunkCommitRows(rows, COMMIT_CHUNK)) {
        const res = await commitImportRows(part, { updateExisting: false }).catch(() => null);
        const outcomes = res?.ok && res.outcomes?.length === part.length ? res.outcomes : null;
        if (!outcomes) failed += part.length;
        else {
          added = added.concat(outcomes.filter((o) => o.outcome === 'added' && o.activityId).map((o) => o.activityId!));
          failed += outcomes.filter((o) => o.outcome === 'failed').length;
        }
        n += part.length;
        setProgress(`Adding ${n} of ${rows.length}…`);
      }
      setProgress('Grouping…');
      // Pin them to THIS franchise first (locked), and skip the provider
      // grouping: regrouping then keeps them here (their lock and the shared
      // franchise link them to it), so no new, soon-empty franchise is made
      // for them, even when this one was merged by hand.
      for (const part of chunk(added, 100)) await addToFranchise(franchiseId, part).catch(() => null);
      await finishImport().catch(() => null);
    } finally {
      setProgress(null);
    }
    if (failed) toast.error(`${failed} title${failed === 1 ? '' : 's'} could not be added.`);
    if (added.length) toast.success(`Added ${added.length} title${added.length === 1 ? '' : 's'}.`);
    router.refresh();
    onBack();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={busy}>
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
          Back
        </Button>
        <span className="text-sm font-medium">Missing titles</span>
      </div>

      {error ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      ) : !groups ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Looking the franchise up…
        </p>
      ) : (
        <>
          {groups.map((g) =>
            g.message ? (
              <p key={g.provider} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {g.message}
              </p>
            ) : null,
          )}
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">
              None of these titles comes from AniList, a TMDB collection or an IGDB franchise, so there is nothing to
              look up.
            </p>
          )}
          {groups.length > 0 && titles.length === 0 && !groups.some((g) => g.message) && (
            <p className="text-sm text-muted-foreground">You already have every title of this franchise.</p>
          )}
          {titles.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  {chosen.length} of {titles.length} ticked
                </span>
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => setTicked(new Set(titles.map(keyOf)))}>
                  Tick all
                </button>
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => setTicked(new Set())}>
                  Untick all
                </button>
              </div>
              <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-lg border border-border" aria-label="Missing titles">
                {titles.map((t) => {
                  const k = keyOf(t);
                  const f = t.result.fields;
                  const name = titleOf({ title: t.result.title, titleEnglish: f.titleEnglish, titleRomaji: f.titleRomaji, titleNative: f.titleNative });
                  return (
                    <li key={k}>
                      <label className="flex cursor-pointer items-center gap-3 p-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-primary"
                          checked={ticked.has(k)}
                          disabled={busy}
                          onChange={() => toggle(k)}
                        />
                        <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
                          {t.result.imageUrl ? (
                            <Image src={t.result.imageUrl} alt="" fill sizes="40px" className="object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {CATEGORIES[t.slug].singular}
                            {t.result.subtitle ? ` · ${t.result.subtitle}` : t.result.year ? ` · ${t.result.year}` : ''}
                          </span>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1" role="group" aria-label="Add them as">
                  <Button type="button" size="sm" variant={done ? 'default' : 'outline'} aria-pressed={done} disabled={busy} onClick={() => setDone(true)}>
                    {doneLabel}
                  </Button>
                  <Button type="button" size="sm" variant={done ? 'outline' : 'default'} aria-pressed={!done} disabled={busy} onClick={() => setDone(false)}>
                    Want
                  </Button>
                </div>
                <Button type="button" size="sm" disabled={busy || chosen.length === 0} onClick={() => void add()}>
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Plus className="mr-1.5 h-4 w-4" aria-hidden />}
                  {progress ?? `Add ${chosen.length}`}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
