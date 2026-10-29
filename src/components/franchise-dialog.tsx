'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRight, Check, ImageOff, ListPlus, Loader2, Merge, Trash2, X } from 'lucide-react';

import { memberAverage } from '@/components/franchise-group';
import { FranchiseMissing } from '@/components/franchise-missing';
import { useDisplayTitle, useScoreFormat } from '@/components/prefs-provider';
import { RatingControl } from '@/components/rating-control';
import { RatingInput } from '@/components/rating-input';
import { SortableRankList, type RankRow } from '@/components/sortable-rank-list';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { settle } from '@/lib/action-result';
import {
  assignFranchise,
  deleteFranchise,
  mergeFranchise,
  saveFranchiseOrder,
  setFranchiseOrderMode,
  updateFranchise,
} from '@/lib/actions/franchise';
import { nextInFranchise, type OrderMode } from '@/lib/franchise/order';
import { statusLabel } from '@/lib/status';
import { CATEGORIES } from '@/lib/categories';
import type { ActionResult, FranchiseWithMembers } from '@/lib/types';
import { cn } from '@/lib/utils';

interface FranchiseDialogProps {
  franchise: FranchiseWithMembers | null;
  /** Every franchise (merge targets). */
  all: { id: string; name: string }[];
  onClose: () => void;
}

/**
 * Edit one franchise: name, the IP's own rating, notes and cover; see and
 * prune its titles; merge it into another franchise or delete the group.
 */
export function FranchiseDialog({ franchise, all, onClose }: FranchiseDialogProps) {
  const router = useRouter();
  const { scoreOutOf } = useScoreFormat();
  const titleOf = useDisplayTitle();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [mergeTarget, setMergeTarget] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addingMissing, setAddingMissing] = useState(false);
  // Manual watch order, optimistic while it saves.
  const [order, setOrder] = useState<string[]>([]);
  const memberKey = franchise?.members.map((m) => m.id).join(',') ?? '';
  useEffect(() => {
    setOrder(franchise?.members.map((m) => m.id) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [franchise?.id, memberKey]);

  useEffect(() => {
    setName(franchise?.name ?? '');
    setNotes(franchise?.notes ?? '');
    setMergeTarget('');
    setConfirmDelete(false);
    setAddingMissing(false);
    // Only when switching to another franchise, so refreshes keep typed edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [franchise?.id]);

  if (!franchise) return <Dialog open={false} onOpenChange={(o) => !o && onClose()} />;
  const f = franchise;

  async function run(action: () => Promise<ActionResult>, success: string, close = false) {
    setBusy(true);
    try {
      const res = await settle(action());
      if (res.ok) {
        toast.success(success);
        router.refresh();
        if (close) onClose();
      } else {
        toast.error(res.error ?? 'Something went wrong.');
      }
    } finally {
      setBusy(false);
    }
  }

  const avg = memberAverage(f.members);
  const byId = new Map(f.members.map((m) => [m.id, m]));
  const ordered = order.map((id) => byId.get(id)).filter((m): m is (typeof f.members)[number] => !!m);
  const next = nextInFranchise(f.members);
  const orderRows: RankRow[] = ordered.map((m) => ({
    id: m.id,
    title: titleOf(m.media),
    imageUrl: m.media.imageUrl,
    subtitle: [CATEGORIES[m.category].singular, m.media.year, statusLabel(m.status, m.category)]
      .filter((x) => x != null)
      .join(' · '),
  }));

  function changeMode(mode: OrderMode) {
    if (mode === f.orderMode) return;
    void run(
      () => setFranchiseOrderMode(f.id, mode),
      mode === 'manual' ? 'Drag the titles into your watch order.' : 'Back to release order.',
    );
  }

  async function reorder(rows: RankRow[]) {
    const prev = order;
    setOrder(rows.map((r) => r.id));
    setBusy(true);
    try {
      const res = await settle(saveFranchiseOrder(f.id, rows.map((r) => r.id)));
      if (res.ok) router.refresh();
      else {
        setOrder(prev);
        toast.error(res.error ?? 'Could not save the order.');
      }
    } finally {
      setBusy(false);
    }
  }
  const covers = f.members.filter((m) => m.media.imageUrl);
  const others = all.filter((o) => o.id !== f.id);
  // Only these sections have provider data to find the rest of the IP (2.10).
  const canFindMissing = f.members.some((m) => ['anime', 'manga', 'movies', 'games'].includes(m.category));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bottom-0 top-auto flex max-h-[92dvh] max-w-full translate-y-0 flex-col overflow-hidden rounded-t-2xl border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-auto sm:top-[50%] sm:max-h-[90vh] sm:max-w-2xl sm:translate-y-[-50%] sm:rounded-lg sm:border-b sm:p-6">
        <DialogHeader>
          <DialogTitle className="pr-6">{f.name}</DialogTitle>
        </DialogHeader>

        {addingMissing ? (
          <FranchiseMissing franchiseId={f.id} onBack={() => setAddingMissing(false)} />
        ) : (
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="franchise-name">
                Name
              </label>
              <div className="flex gap-2">
                <Input
                  id="franchise-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-base sm:text-sm"
                />
                <Button
                  variant="outline"
                  disabled={busy || !name.trim() || name.trim() === f.name}
                  onClick={() => run(() => updateFranchise(f.id, { name }), 'Renamed.')}
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  Save
                </Button>
              </div>
            </div>

            {/* IP rating */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Your rating of the whole IP</label>
                {f.rating != null && (
                  <button
                    type="button"
                    onClick={() => run(() => updateFranchise(f.id, { rating: null }), 'Rating cleared.')}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <RatingInput
                value={f.rating}
                onChange={(v) => run(() => updateFranchise(f.id, { rating: v }), `Rated ${scoreOutOf(v)}.`)}
              />
              <p className="text-xs text-muted-foreground">
                Separate from each title&apos;s own rating.
                {avg != null && ` Your titles average ${scoreOutOf(avg)}.`}
              </p>
            </div>

            {/* Cover */}
            {covers.length > 1 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Cover</label>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {covers.map((m) => {
                    const active = (f.imageUrl ?? covers[0]?.media.imageUrl) === m.media.imageUrl;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        title={titleOf(m.media)}
                        onClick={() =>
                          run(() => updateFranchise(f.id, { imageUrl: m.media.imageUrl }), 'Cover updated.')
                        }
                        className={cn(
                          'relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-md ring-2 transition',
                          active ? 'ring-primary' : 'ring-transparent opacity-70 hover:opacity-100',
                        )}
                      >
                        <Image src={m.media.imageUrl as string} alt={titleOf(m.media)} fill sizes="56px" className="object-cover" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Watch order (4.7) */}
            {f.members.length > 1 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-medium">Watch order</label>
                  <div role="group" aria-label="Watch order" className="inline-flex rounded-md border border-border p-0.5">
                    {(
                      [
                        ['release', 'Release order'],
                        ['manual', 'My order'],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        disabled={busy}
                        aria-pressed={f.orderMode === mode}
                        onClick={() => changeMode(mode)}
                        className={cn(
                          'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                          f.orderMode === mode ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {next && (
                  <p className="flex items-center gap-1.5 text-sm">
                    <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <span className="text-muted-foreground">Next up:</span>
                    <span className="truncate font-medium">{titleOf(next.media)}</span>
                  </p>
                )}
                {f.orderMode === 'manual' ? (
                  <SortableRankList items={orderRows} onReorder={(rows) => void reorder(rows)} disabled={busy} />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Titles are listed by release date. Switch to “My order” to drag them into the order you
                    want to watch them.
                  </p>
                )}
              </div>
            )}

            {/* Members */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium">Titles · {f.members.length}</label>
                {canFindMissing && (
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setAddingMissing(true)}>
                    <ListPlus className="mr-1.5 h-4 w-4" aria-hidden />
                    Add missing titles
                  </Button>
                )}
              </div>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {f.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 p-2">
                    <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
                      {m.media.imageUrl ? (
                        <Image src={m.media.imageUrl} alt={titleOf(m.media)} fill sizes="40px" className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/${m.category}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {titleOf(m.media)}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{CATEGORIES[m.category].singular}</span>
                        {m.media.year != null && <span>· {m.media.year}</span>}
                        <StatusBadge status={m.status} slug={m.category} className="px-1.5 py-0 text-[11px]" />
                      </div>
                    </div>
                    <RatingControl value={m.rating} />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => assignFranchise(m.id, null), `Removed "${titleOf(m.media)}".`)}
                      aria-label={`Remove ${titleOf(m.media)} from this franchise`}
                      title="Remove from franchise"
                      className="rounded p-1 text-muted-foreground hover:text-rose-500 disabled:opacity-30"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="franchise-notes">
                Notes
              </label>
              <Textarea
                id="franchise-notes"
                value={notes}
                rows={3}
                placeholder="Watch order, thoughts on the IP…"
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => {
                  if (notes !== (f.notes ?? '')) run(() => updateFranchise(f.id, { notes }), 'Notes saved.');
                }}
                className="text-base sm:text-sm"
              />
            </div>

            {/* Merge */}
            {others.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Merge into another franchise</label>
                <div className="flex gap-2">
                  <Select value={mergeTarget} onValueChange={setMergeTarget}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Pick a franchise…" />
                    </SelectTrigger>
                    <SelectContent>
                      {others.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    disabled={busy || !mergeTarget}
                    onClick={() => run(() => mergeFranchise(f.id, mergeTarget), 'Merged.', true)}
                  >
                    <Merge className="mr-1.5 h-4 w-4" />
                    Merge
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-3">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Delete the group? Titles stay.</span>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => run(() => deleteFranchise(f.id), 'Franchise deleted.', true)}
              >
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="text-rose-500" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete group
            </Button>
          )}
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
