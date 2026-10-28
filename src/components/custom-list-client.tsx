'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  Copy,
  ImageOff,
  Link2,
  Loader2,
  LogOut,
  PencilLine,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';

import { useDisplayTitle } from '@/components/prefs-provider';
import { SortableRankList, type RankRow } from '@/components/sortable-rank-list';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  addResultToList,
  deleteList,
  inviteToList,
  removeListItem,
  leaveList,
  removeListMember,
  reorderListItems,
  setListMemberRole,
  updateList,
} from '@/lib/actions/lists';
import { searchMedia } from '@/lib/actions/media';
import { createShareLink } from '@/lib/actions/share';
import { CATEGORIES, NAV_ORDER, type CategorySlug } from '@/lib/categories';
import type { CustomListView, ListItemView } from '@/lib/data-lists';
import { LIST_DESCRIPTION_MAX, LIST_NAME_MAX } from '@/lib/lists';
import type { ActionResult, NormalizedResult } from '@/lib/types';

interface Props {
  list: CustomListView;
}

/**
 * A custom list (spec 4.11). Everyone with access sees the titles; owners
 * and editors add (from search here, or "Add to list…" in a title's
 * details), remove and drag to reorder; the owner renames, shares, invites
 * by username and deletes. Members never see each other's libraries.
 */
export function CustomListClient({ list }: Props) {
  const router = useRouter();
  const titleOf = useDisplayTitle();
  const canEdit = list.role === 'owner' || list.role === 'editor';
  const isOwner = list.role === 'owner';
  const [items, setItems] = useState<ListItemView[]>(list.items);
  const [pending, setPending] = useState(false);
  useEffect(() => setItems(list.items), [list.items]);

  const byId = new Map(items.map((it) => [it.id, it]));
  const rows: RankRow[] = items.map((it) => ({
    id: it.id,
    title: titleOf(it.media),
    imageUrl: it.media.imageUrl,
    subtitle: [CATEGORIES[it.category].singular, it.media.year].filter((x) => x != null).join(' · '),
  }));

  async function reorder(next: RankRow[]) {
    const prev = items;
    setItems(next.map((r) => byId.get(r.id)!).filter(Boolean));
    setPending(true);
    const res = await reorderListItems(list.id, next.map((r) => r.id));
    setPending(false);
    if (!res.ok) {
      setItems(prev);
      toast.error(res.error ?? 'Could not save the order.');
      router.refresh();
    }
  }

  async function remove(id: string) {
    const prev = items;
    setItems(items.filter((it) => it.id !== id));
    setPending(true);
    const res = await removeListItem(list.id, id);
    setPending(false);
    if (!res.ok) {
      setItems(prev);
      toast.error(res.error ?? 'Could not remove that title.');
    } else router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <ListHeader list={list} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="list-items" className="space-y-3">
          <h2 id="list-items" className="text-lg font-semibold">
            Titles <span className="text-sm font-normal text-muted-foreground">· {items.length}</span>
          </h2>
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {canEdit
                ? 'Nothing here yet. Search below, or use “Add to list…” in any title’s details.'
                : 'Nothing here yet.'}
            </p>
          ) : canEdit ? (
            <SortableRankList items={rows} onReorder={(r) => void reorder(r)} onRemove={(id) => void remove(id)} disabled={pending} />
          ) : (
            <ol className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2">
                  <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                  <Cover src={r.imageUrl} alt={r.title} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium leading-snug">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="space-y-8">
          {canEdit && <ListSearch listId={list.id} />}
          <Members list={list} isOwner={isOwner} />
        </aside>
      </div>
    </div>
  );
}

function Cover({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-muted ring-1 ring-border">
      {src ? (
        <Image src={src} alt={alt} fill sizes="40px" className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
      )}
    </div>
  );
}

function ListHeader({ list }: { list: CustomListView }) {
  const router = useRouter();
  const isOwner = list.role === 'owner';
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? '');
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(action: () => Promise<ActionResult & { url?: string }>, onOk: (res: ActionResult & { url?: string }) => void) {
    setBusy(true);
    try {
      const res = await action();
      if (res.ok) onOk(res);
      else toast.error(res.error ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-3">
      <Link href="/lists" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Lists
      </Link>
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => updateList(list.id, name, description),
              () => {
                toast.success('Saved.');
                setEditing(false);
                router.refresh();
              },
            );
          }}
        >
          <Input value={name} maxLength={LIST_NAME_MAX} aria-label="Name" onChange={(e) => setName(e.target.value)} className="text-base sm:text-sm" />
          <Textarea
            value={description}
            maxLength={LIST_DESCRIPTION_MAX}
            rows={2}
            aria-label="Description"
            placeholder="What is this list for?"
            onChange={(e) => setDescription(e.target.value)}
            className="text-base sm:text-sm"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <h1 className="break-words text-2xl font-bold tracking-tight">{list.name}</h1>
          {list.description && <p className="mt-1 whitespace-pre-line text-sm">{list.description}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {isOwner ? 'Your list' : `By ${list.owner} · ${list.role === 'editor' ? 'you can edit it' : 'view only'}`}
          </p>
        </div>
      )}

      {isOwner && !editing && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setEditing(true)}>
            <PencilLine className="mr-2 h-4 w-4" aria-hidden />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(
                () => createShareLink('list', list.id),
                (res) => {
                  if (res.url) {
                    setShareUrl(res.url);
                    void copy(res.url);
                  }
                },
              )
            }
          >
            <Link2 className="mr-2 h-4 w-4" aria-hidden />
            Share link
          </Button>
          {confirmDelete ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => deleteList(list.id),
                    () => {
                      toast.success('List deleted.');
                      router.push('/lists');
                    },
                  )
                }
              >
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
      )}

      {shareUrl && (
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex gap-2">
            <Input
              readOnly
              value={shareUrl}
              aria-label="Share link"
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 min-w-0 flex-1 text-base sm:text-sm"
            />
            <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => void copy(shareUrl)}>
              {copied ? <Check className="mr-2 h-4 w-4" aria-hidden /> : <Copy className="mr-2 h-4 w-4" aria-hidden />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Anyone with this link sees the list&apos;s titles and covers, nothing else. Revoke it any time in{' '}
            <Link href="/settings#sharing" className="underline underline-offset-2">
              Settings → Sharing
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}

/** Search a section and add hits to the LIST (not to your library). */
function ListSearch({ listId }: { listId: string }) {
  const router = useRouter();
  const titleOf = useDisplayTitle();
  const [slug, setSlug] = useState<CategorySlug>('movies');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NormalizedResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [added, setAdded] = useState<Record<string, 'saving' | 'done'>>({});
  const seq = useRef(0);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const id = ++seq.current;
    setSearching(true);
    setError(null);
    try {
      const res = await searchMedia(slug, q);
      if (id !== seq.current) return;
      setResults(res.results.slice(0, 10));
      setError(res.error ?? (res.results.length === 0 ? 'No matches.' : null));
    } catch {
      if (id === seq.current) setError('Search failed. Try again.');
    } finally {
      if (id === seq.current) setSearching(false);
    }
  }

  async function add(r: NormalizedResult) {
    const key = `${slug}:${r.externalId}`;
    setAdded((a) => ({ ...a, [key]: 'saving' }));
    const res = await addResultToList(listId, slug, r);
    if (!res.ok) {
      setAdded(({ [key]: _gone, ...rest }) => rest);
      toast.error(res.error ?? 'Could not add it.');
      return;
    }
    setAdded((a) => ({ ...a, [key]: 'done' }));
    if (res.existing) toast.info('Already on this list.');
    router.refresh();
  }

  return (
    <section aria-labelledby="list-search" className="space-y-3">
      <h2 id="list-search" className="text-lg font-semibold">
        Add titles
      </h2>
      <p className="text-xs text-muted-foreground">Adding to the list doesn&apos;t add anything to your library.</p>
      <form onSubmit={search} className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
        <Select
          value={slug}
          onValueChange={(v) => {
            setSlug(v as CategorySlug);
            setResults([]);
            setError(null);
          }}
        >
          <SelectTrigger className="sm:w-36 lg:w-full xl:w-36" aria-label="Section">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NAV_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {CATEGORIES[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex min-w-0 flex-1 gap-2">
          <Input
            value={query}
            placeholder={`Search ${CATEGORIES[slug].label.toLowerCase()}…`}
            aria-label="Search"
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 text-base sm:text-sm"
          />
          <Button type="submit" variant="secondary" disabled={searching || !query.trim()} aria-label="Search">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          </Button>
        </div>
      </form>
      {error && <p className="text-sm text-muted-foreground">{error}</p>}
      {results.length > 0 && (
        <ul className="space-y-2">
          {results.map((r) => {
            const key = `${slug}:${r.externalId}`;
            const state = added[key];
            const title = titleOf({ ...r.fields, title: r.title });
            return (
              <li key={key} className="flex items-center gap-3 rounded-md border border-border p-2">
                <Cover src={r.imageUrl} alt={title} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={title}>
                    {title}
                  </p>
                  {r.subtitle && <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>}
                </div>
                {state === 'done' ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-emerald-500">
                    <Check className="h-4 w-4" aria-hidden />
                    Added
                  </span>
                ) : (
                  <Button size="sm" variant="outline" disabled={state === 'saving'} onClick={() => void add(r)}>
                    {state === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                    <span className="ml-1.5">Add</span>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Members({ list, isOwner }: { list: CustomListView; isOwner: boolean }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<ActionResult>, success: string, after?: () => void) {
    setBusy(true);
    try {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error ?? 'Something went wrong.');
        return;
      }
      toast.success(success);
      if (after) after();
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner) {
    return (
      <section aria-labelledby="list-members" className="space-y-3">
        <h2 id="list-members" className="text-lg font-semibold">
          Shared list
        </h2>
        <p className="text-sm text-muted-foreground">
          {list.owner} shared this with you. You only see the list, never anyone&apos;s library.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void run(() => leaveList(list.id), 'You left the list.', () => router.push('/lists?tab=shared'))}
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden />
          Leave list
        </Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="list-members" className="space-y-3">
      <h2 id="list-members" className="text-lg font-semibold">
        Members
      </h2>
      <p className="text-xs text-muted-foreground">
        Invite someone on this Hoard by their username. Viewers can look; editors can add, remove and reorder titles.
        Nobody sees anyone&apos;s library.
      </p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => inviteToList(list.id, username, role === 'editor'), `Invited ${username.trim()}.`, () => {
            setUsername('');
            router.refresh();
          });
        }}
      >
        <Input
          value={username}
          placeholder="Username"
          aria-label="Username"
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(e) => setUsername(e.target.value)}
          className="min-w-0 flex-1 basis-40 text-base sm:text-sm"
        />
        <Select value={role} onValueChange={(v) => setRole(v as 'viewer' | 'editor')}>
          <SelectTrigger className="w-28" aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="secondary" disabled={busy || !username.trim()}>
          <UserPlus className="mr-2 h-4 w-4" aria-hidden />
          Invite
        </Button>
      </form>
      {list.members.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {list.members.map((m) => (
            <li key={m.username} className="flex items-center gap-2 p-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.username}</span>
              <Select
                value={m.canEdit ? 'editor' : 'viewer'}
                disabled={busy}
                onValueChange={(v) =>
                  void run(() => setListMemberRole(list.id, m.username, v === 'editor'), `${m.username} is now ${v === 'editor' ? 'an editor' : 'a viewer'}.`)
                }
              >
                <SelectTrigger className="h-8 w-28" aria-label={`Role of ${m.username}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                </SelectContent>
              </Select>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => removeListMember(list.id, m.username), `Removed ${m.username}.`)}
                aria-label={`Remove ${m.username}`}
                className="rounded p-1 text-muted-foreground hover:text-rose-500 disabled:opacity-30"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
