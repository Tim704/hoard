'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, RefreshCw, Trash2, X } from 'lucide-react';

import { AddResultRow, useAddRows } from '@/components/add-row';
import { fillBuiltin, RefProgressBar } from '@/components/lists-client';
import { Button } from '@/components/ui/button';
import { settle } from '@/lib/action-result';
import { deleteRefList, removeRefListItem } from '@/lib/actions/reflists';
import { CATEGORIES } from '@/lib/categories';
import type { RefItemView, RefListView } from '@/lib/data-reflists';
import { formatYmd } from '@/lib/release';
import { isBuiltinSource, refState } from '@/lib/reflists';
import type { NormalizedResult } from '@/lib/types';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'todo';

/** The catalogue hit an add button sends (the add path enriches it server-side). */
const resultOf = (it: RefItemView): NormalizedResult => ({
  externalId: it.externalId,
  title: it.title,
  imageUrl: it.imageUrl,
  subtitle: null,
  year: it.year,
  description: null,
  fields: { externalId: it.externalId, title: it.title, imageUrl: it.imageUrl, year: it.year },
});

export function RefListClient({ list }: { list: RefListView }) {
  const router = useRouter();
  const { rows, add, saveRating, setRow } = useAddRows();
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const builtin = isBuiltinSource(list.source);
  const visible = filter === 'todo' ? list.items.filter((it) => refState(it.library?.status) !== 'done') : list.items;
  const stamp = (list.refreshedAt ?? list.createdAt).slice(0, 10);

  async function refresh() {
    if (!isBuiltinSource(list.source)) return;
    setBusy('Fetching…');
    try {
      if (await fillBuiltin(list.id, setBusy)) toast.success('List refreshed.');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function removeItem(it: RefItemView) {
    setBusy('Removing…');
    try {
      const res = await settle(removeRefListItem(list.id, it.id));
      if (!res.ok) toast.error(res.error ?? 'Could not remove that title.');
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('Deleting…');
    try {
      const res = await settle(deleteRefList(list.id));
      if (!res.ok) {
        toast.error(res.error ?? 'Could not delete the list.');
        return;
      }
      toast.success('List deleted.');
      router.push('/lists?tab=ref');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div>
        <Link
          href="/lists?tab=ref"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Reference lists
        </Link>
        <h1 className="mt-2 break-words text-2xl font-bold tracking-tight">{list.name}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {CATEGORIES[list.category].label} · {builtin ? 'fetched' : 'made'} {formatYmd(stamp)}
        </p>
        <RefProgressBar done={list.done} planned={list.planned} total={list.total} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Show" className="inline-flex rounded-md border border-border p-0.5">
          {(
            [
              ['all', 'All'],
              ['todo', 'Not done'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={cn(
                'rounded px-3 py-1 text-sm font-medium transition-colors',
                filter === id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {builtin && (
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy !== null}>
              {busy === 'Fetching…' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              )}
              {busy === 'Fetching…' ? busy : 'Refresh'}
            </Button>
          )}
          {confirmDelete ? (
            <>
              <Button variant="destructive" size="sm" onClick={() => void remove()} disabled={busy !== null}>
                Delete list
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              Delete
            </Button>
          )}
        </div>
      </div>

      {list.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nothing on this list yet.{builtin && ' Refresh to fetch it.'}
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          You have done every title on this list.
        </p>
      ) : (
        <ol className="space-y-2">
          {visible.map((it) => {
            const key = it.id;
            return (
              <li key={key} className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-muted-foreground">
                  {it.position}
                </span>
                <div className="min-w-0 flex-1">
                  <AddResultRow
                    slug={list.category}
                    result={resultOf(it)}
                    row={rows[key]}
                    inLibrary={it.library}
                    onAdd={(status) => void add(key, list.category, resultOf(it), status)}
                    onRate={(rating) => {
                      const r = rows[key];
                      if (r?.phase === 'rating') void saveRating(key, r.activityId, rating);
                    }}
                    onSkipRate={() => setRow(key, { phase: 'done', rating: null })}
                  />
                </div>
                {!builtin && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void removeItem(it)}
                    aria-label={`Remove ${it.title} from this list`}
                    title="Remove from list"
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-rose-500 disabled:opacity-30"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
