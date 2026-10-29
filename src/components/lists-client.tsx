'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ClipboardList, ImageOff, ListChecks, Loader2, Plus, Sparkles, Trophy, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { settle } from '@/lib/action-result';
import { createList } from '@/lib/actions/lists';
import { addPastedRefItems, createBuiltinRefList, createPastedRefList, refreshRefList } from '@/lib/actions/reflists';
import { CATEGORIES, NAV_ORDER, type CategorySlug } from '@/lib/categories';
import type { ListSummary } from '@/lib/data-lists';
import type { BuiltinChoice, RefListSummary } from '@/lib/data-reflists';
import { AI_MAX_TEXT, type AiItem } from '@/lib/import/ai';
import { MATCH_CHUNK } from '@/lib/import/types';
import { LIST_DESCRIPTION_MAX, LIST_NAME_MAX } from '@/lib/lists';
import { cleanPastedTitle, parsePlainLines } from '@/lib/reflists';
import { cn } from '@/lib/utils';

export type ListsTab = 'mine' | 'shared' | 'ref';

interface ListsClientProps {
  tab: ListsTab;
  mine: ListSummary[];
  shared: ListSummary[];
  refLists: RefListSummary[];
  builtins: BuiltinChoice[];
  aiConfigured: boolean;
}

const TABS = [
  { id: 'mine', label: 'My lists', icon: ClipboardList, href: '/lists' },
  { id: 'shared', label: 'Shared with me', icon: Users, href: '/lists?tab=shared' },
  { id: 'ref', label: 'Reference lists', icon: Trophy, href: '/lists?tab=ref' },
] as const;

/** `/lists`: custom lists (4.11) and reference lists (4.8). */
export function ListsClient({ tab, mine, shared, refLists, builtins, aiConfigured }: ListsClientProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-[var(--page-pad)] py-4 sm:py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Lists</h1>
        <p className="text-sm text-muted-foreground">
          Your own lists of anything, lists friends shared with you, and the classics to work through.
        </p>
      </header>

      <nav aria-label="Lists" className="flex max-w-full overflow-x-auto rounded-md border border-border bg-muted/40 p-0.5 sm:inline-flex">
        {TABS.map(({ id, label, icon: Icon, href }) => (
          <Link
            key={id}
            href={href}
            aria-current={tab === id ? 'page' : undefined}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors',
              tab === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>

      {tab === 'mine' ? (
        <div className="space-y-6">
          <NewListForm />
          <ListGrid lists={mine} empty="No lists yet. Make one above, then add titles from any title's details or the list's own search." />
        </div>
      ) : tab === 'shared' ? (
        <ListGrid lists={shared} empty="Nobody has shared a list with you yet. When someone invites you by your username, it shows up here." />
      ) : (
        <RefTab lists={refLists} builtins={builtins} aiConfigured={aiConfigured} />
      )}
    </div>
  );
}

function NewListForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await settle(createList(name, description));
      if (!res.ok || !res.id) {
        toast.error(res.error ?? 'Could not create the list.');
        return;
      }
      toast.success('List created.');
      router.push(`/lists/${res.id}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <Plus className="mr-2 h-4 w-4" aria-hidden />
        New list
      </Button>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="space-y-1.5">
        <label htmlFor="new-list-name" className="text-sm font-medium">
          Name
        </label>
        <Input
          id="new-list-name"
          value={name}
          maxLength={LIST_NAME_MAX}
          autoFocus
          placeholder="Comfort watches, Books for the beach…"
          onChange={(e) => setName(e.target.value)}
          className="text-base sm:text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="new-list-description" className="text-sm font-medium">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="new-list-description"
          value={description}
          maxLength={LIST_DESCRIPTION_MAX}
          rows={2}
          onChange={(e) => setDescription(e.target.value)}
          className="text-base sm:text-sm"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          Create list
        </Button>
      </div>
    </form>
  );
}

function ListGrid({ lists, empty }: { lists: ListSummary[]; empty: string }) {
  if (lists.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{empty}</p>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {lists.map((l) => (
        <li key={l.id}>
          <Link
            href={`/lists/${l.id}`}
            className="flex h-full gap-3 rounded-lg border border-border bg-card p-3 transition hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex shrink-0 -space-x-6">
              {(l.covers.length ? l.covers.slice(0, 3) : [null]).map((src, i) => (
                <div key={i} className="relative h-16 w-11 overflow-hidden rounded bg-muted ring-2 ring-card">
                  {src ? (
                    <Image src={src} alt="" fill sizes="44px" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{l.name}</p>
              <p className="text-xs text-muted-foreground">
                {l.itemCount} {l.itemCount === 1 ? 'title' : 'titles'}
                {l.role !== 'owner' && ` · by ${l.owner} · ${l.role === 'editor' ? 'you can edit' : 'view only'}`}
              </p>
              {l.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{l.description}</p>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ── Reference lists ───────────────────────────────────────────────────────

function RefTab({ lists, builtins, aiConfigured }: { lists: RefListSummary[]; builtins: BuiltinChoice[]; aiConfigured: boolean }) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function startBuiltin(b: BuiltinChoice) {
    if (b.listId) {
      router.push(`/lists/ref/${b.listId}`);
      return;
    }
    setWorking(b.source);
    try {
      const res = await settle(createBuiltinRefList(b.source));
      if (!res.ok || !res.id) {
        toast.error(res.error ?? 'Could not create the list.');
        return;
      }
      const ok = res.existing ? true : await fillBuiltin(res.id, setProgress);
      if (ok) toast.success(`${b.name} is ready.`);
      router.push(`/lists/ref/${res.id}`);
    } finally {
      setWorking(null);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-8">
      {lists.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Your reference lists</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {lists.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/lists/ref/${l.id}`}
                  className="block rounded-lg border border-border bg-card p-3 transition hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium">{l.name}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">{CATEGORIES[l.category].label}</span>
                  </div>
                  <RefProgressBar done={l.done} planned={l.planned} total={l.total} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Start from a classic</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {builtins.map((b) => (
            <li key={b.source} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
              <div>
                <p className="font-medium">{b.name}</p>
                <p className="text-xs text-muted-foreground">{b.blurb}</p>
              </div>
              {!b.configured && !b.listId ? (
                <p className="mt-auto text-xs text-muted-foreground">
                  {b.provider} isn&apos;t configured on this server, so this list isn&apos;t available.
                </p>
              ) : (
                <Button
                  variant={b.listId ? 'outline' : 'secondary'}
                  size="sm"
                  className="mt-auto self-start"
                  disabled={working !== null}
                  onClick={() => void startBuiltin(b)}
                >
                  {working === b.source ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <ListChecks className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  {b.listId ? 'Open' : working === b.source && progress ? progress : 'Create'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <PasteForm aiConfigured={aiConfigured} />
    </div>
  );
}

/** Fetch (or refetch) a built-in list; false when it failed (the toast says why). */
export async function fillBuiltin(listId: string, onProgress: (text: string) => void): Promise<boolean> {
  onProgress('Fetching…');
  const res = await settle(refreshRefList(listId));
  if (!res.ok) toast.error(res.error ?? 'Could not fetch the list.');
  return res.ok;
}

export function RefProgressBar({ done, planned, total }: { done: number; planned: number; total: number }) {
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : '0%');
  return (
    <div className="mt-2 space-y-1">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="bg-emerald-500" style={{ width: pct(done) }} />
        <div className="bg-sky-500/70" style={{ width: pct(planned) }} />
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{done}</span> of {total} done
        {planned > 0 && ` · ${planned} planned`}
      </p>
    </div>
  );
}

function PasteForm({ aiConfigured }: { aiConfigured: boolean }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [section, setSection] = useState<CategorySlug>('movies');
  const [text, setText] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ id: string; added: number; missed: string[] } | null>(null);

  async function titlesFromAi(): Promise<{ title: string; year?: number }[] | null> {
    const body = new FormData();
    body.set('text', text.trim());
    const res = await fetch('/api/ai/parse-list', { method: 'POST', body });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; items?: AiItem[] } | null;
    if (!json?.ok || !json.items) {
      toast.error(json?.error ?? 'The AI reader is unavailable right now.');
      return null;
    }
    return [...json.items]
      .map((it, i) => ({ it, i }))
      .sort((a, b) => (a.it.rank ?? Infinity) - (b.it.rank ?? Infinity) || a.i - b.i)
      .map(({ it }) => cleanPastedTitle(it.title, it.year))
      .filter((t): t is { title: string; year?: number } => t !== null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOutcome(null);
    try {
      setProgress(useAi ? 'Reading the list…' : null);
      const titles = useAi
        ? await titlesFromAi()
        : parsePlainLines(text)
            .map((t) => cleanPastedTitle(t.title, t.year))
            .filter((t): t is { title: string; year?: number } => t !== null);
      if (!titles) return;
      if (titles.length === 0) {
        toast.error('No titles were found in that.');
        return;
      }
      const created = await settle(createPastedRefList(name, section));
      if (!created.ok || !created.id) {
        toast.error(created.error ?? 'Could not create the list.');
        return;
      }
      let added = 0;
      const missed: string[] = [];
      for (let i = 0; i < titles.length; i += MATCH_CHUNK) {
        setProgress(`Matching ${Math.min(i + MATCH_CHUNK, titles.length)} of ${titles.length}…`);
        const res = await settle(addPastedRefItems(created.id, titles.slice(i, i + MATCH_CHUNK)));
        if (!res.ok) {
          toast.error(res.error ?? 'Matching failed.');
          break;
        }
        added += res.added ?? 0;
        missed.push(...(res.missed ?? []));
      }
      if (missed.length) {
        // Stay here and name every title that didn't go in.
        setOutcome({ id: created.id, added, missed });
        router.refresh();
        return;
      }
      toast.success(`${added} titles matched.`);
      router.push(`/lists/ref/${created.id}`);
    } catch {
      toast.error('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const tooLong = text.length > AI_MAX_TEXT;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Paste titles</h2>
      <form onSubmit={submit} className="space-y-3 rounded-lg border border-border bg-card p-3 sm:p-4">
        <p className="text-sm text-muted-foreground">
          A top 100 from a magazine, a friend&apos;s recommendations: one title per line, with the year in brackets.
          Titles that match exactly (title and year) go straight in; the rest are listed so you can find them by
          search.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <Input
            value={name}
            maxLength={LIST_NAME_MAX}
            placeholder="List name"
            aria-label="List name"
            onChange={(e) => setName(e.target.value)}
            className="text-base sm:text-sm"
          />
          <Select value={section} onValueChange={(v) => setSection(v as CategorySlug)}>
            <SelectTrigger aria-label="Section">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NAV_ORDER.map((slug) => (
                <SelectItem key={slug} value={slug}>
                  {CATEGORIES[slug].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Textarea
          value={text}
          rows={6}
          placeholder={'1. The Godfather (1972)\n2. Seven Samurai (1954)\n…'}
          aria-label="Titles"
          onChange={(e) => setText(e.target.value)}
          className="font-mono text-base sm:text-sm"
        />
        {outcome && (
          <div role="status" className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p>
              <span className="font-medium">
                {outcome.added} matched, {outcome.missed.length} not matched.
              </span>{' '}
              These need the exact title and year, or you can find them through the section&apos;s search:
            </p>
            <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
              {outcome.missed.map((t, i) => (
                <li key={i} className="break-words">
                  {t}
                </li>
              ))}
            </ul>
            <Link href={`/lists/ref/${outcome.id}`} className="inline-block font-medium underline underline-offset-2">
              Open the list
            </Link>
          </div>
        )}
        {/* Stacked on phones, one row that never wraps from sm. */}
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className={cn('inline-flex min-w-0 items-center gap-2 text-sm', !aiConfigured && 'text-muted-foreground')}>
            <input
              type="checkbox"
              checked={useAi}
              disabled={!aiConfigured || busy}
              onChange={(e) => setUseAi(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <Sparkles className="h-4 w-4" aria-hidden />
            Let the AI pick out the titles
            {!aiConfigured && <span className="text-xs">(not configured on this server)</span>}
          </label>
          <Button type="submit" className="shrink-0" disabled={busy || !name.trim() || !text.trim() || (useAi && tooLong)}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {progress ?? 'Create list'}
          </Button>
        </div>
      </form>
    </section>
  );
}
