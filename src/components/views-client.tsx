'use client';

// ───────────────────────────────────────────────────────────────────────────
//  /views (spec 8.6): build a filter over the whole library, see the titles
//  as a grid or a list (the section pages' cards), and save it with a name.
//  Saved views open from the navigation's "Views" group (?view=<id>); there
//  they can be changed, renamed or deleted. Rules: src/lib/saved-views.ts.
// ───────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Filter, Loader2, PencilLine, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { ActivityDetailDialog } from '@/components/activity-detail-dialog';
import { MediaGrid } from '@/components/media-grid';
import { MediaTable } from '@/components/media-table';
import { useDisplayTitle, usePrefs } from '@/components/prefs-provider';
import { TagFilter } from '@/components/tag-filter';
import { ViewToggle } from '@/components/view-toggle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { settle } from '@/lib/action-result';
import { createView, deleteView, renameView, updateViewQuery } from '@/lib/actions/views';
import { CATEGORIES, NAV_ORDER, type CategorySlug } from '@/lib/categories';
import type { SavedViewData } from '@/lib/data-views';
import {
  applyView,
  EMPTY_VIEW,
  MAX_VIEW_NAME,
  parseViewQuery,
  VIEW_SORT_LABEL,
  VIEW_SORTS,
  type ViewQuery,
  type ViewSort,
} from '@/lib/saved-views';
import { STATUS_BASE_LABEL, STATUS_ORDER, STATUSES, statusLabel, type Status } from '@/lib/status';
import { countTags, tagKey } from '@/lib/tags';
import { titleHref } from '@/lib/title-href';
import { genreOptions } from '@/lib/tonight';
import { toDisplayUnits, type ActivityWithMedia, type ViewMode } from '@/lib/types';
import { cn } from '@/lib/utils';

const isLayout = (v: unknown): v is ViewMode => v === 'grid' || v === 'list';
const NO_EXPANDED = new Set<string>();
const STATUS_CHOICES = [...STATUSES].sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b]);

/** Same filters? (The order of picks doesn't matter.) */
function sameQuery(a: ViewQuery, b: ViewQuery): boolean {
  const norm = (q: ViewQuery) =>
    JSON.stringify({
      ...q,
      sections: [...q.sections].sort(),
      statuses: [...q.statuses].sort(),
      tags: q.tags.map(tagKey).sort(),
      genres: q.genres.map(tagKey).sort(),
    });
  return norm(a) === norm(b);
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** A number field that holds `null` when empty. */
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min: number;
  max: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      aria-label={label}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step ?? 1}
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        const n = Number(raw);
        onChange(raw === '' || !Number.isFinite(n) ? null : n);
      }}
      className="h-10 w-24 text-base md:h-9 md:text-sm"
    />
  );
}

export function ViewsClient({
  views,
  selected,
  library,
}: {
  views: SavedViewData[];
  /** The saved view being shown (?view=), or null for a new one. */
  selected: SavedViewData | null;
  library: ActivityWithMedia[];
}) {
  const router = useRouter();
  const titleOf = useDisplayTitle();
  const { hiddenSections, titleView } = usePrefs();
  const [query, setQuery] = useState<ViewQuery>(selected?.query ?? EMPTY_VIEW);
  const [layout, setLayout] = usePersistentState<ViewMode>('hoard:views:layout', 'grid', isLayout);
  const [openId, setOpenId] = useState<string | null>(null);
  // A result opens its popup, or its page in the Full page title view.
  const openTitle = (a: ActivityWithMedia) =>
    titleView === 'page' ? router.push(titleHref(a.category, a.id, 'page')) : setOpenId(a.id);
  const hrefFor = titleView === 'page' ? (a: ActivityWithMedia) => titleHref(a.category, a.id, 'page') : undefined;
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // The fields hold what's typed (a year is "1" on its way to "1999"); the
  // filters use the validated query.
  const set = (patch: Partial<ViewQuery>) => setQuery((q) => ({ ...q, ...patch }));
  const valid = useMemo(() => parseViewQuery(query), [query]);

  const sections = NAV_ORDER.filter((s) => !(hiddenSections as string[]).includes(s));
  const oneSection: CategorySlug | undefined = valid.sections.length === 1 ? valid.sections[0] : undefined;
  const statusText = (s: Status) => (oneSection ? statusLabel(s, oneSection) : STATUS_BASE_LABEL[s]);

  const tags = useMemo(() => countTags(library.map((a) => ({ tags: a.tags, section: a.category }))).map((t) => t.tag), [library]);
  const genres = useMemo(
    () =>
      genreOptions(
        library.map((a) => ({ genres: Array.isArray(a.media.genres) ? (a.media.genres as unknown[]).filter((g): g is string => typeof g === 'string') : [] })),
      ),
    [library],
  );

  const results = useMemo(() => applyView(library, valid, (a) => titleOf(a.media)), [library, valid, titleOf]);
  const opened = library.find((a) => a.id === openId) ?? null;
  const dirty = selected ? !sameQuery(selected.query, valid) : false;

  async function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) {
    setBusy(true);
    try {
      const res = await settle(work());
      if (!res.ok) {
        toast.error(res.error ?? 'Something went wrong.');
        return;
      }
      toast.success(done);
      after?.();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveNew() {
    setBusy(true);
    try {
      const res = await settle(createView(name, valid));
      if (!res.ok || !res.id) {
        toast.error(res.error ?? 'Could not save the view.');
        return;
      }
      toast.success('View saved.');
      setName('');
      router.push(`/views?view=${encodeURIComponent(res.id)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 px-[var(--page-pad)] py-4 sm:space-y-6 sm:py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{selected ? selected.name : 'Views'}</h1>
        <p className="text-sm text-muted-foreground">
          {selected ? 'A saved view of your library. Change the filters and save, or start a new one.' : 'Filter your whole library, then save the filter as a view in the navigation.'}
        </p>
        {views.length > 0 && (
          <nav aria-label="Saved views" className="flex flex-wrap gap-1.5 pt-1">
            <Link
              href="/views"
              className={cn(
                'rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-accent',
                !selected && 'bg-accent text-accent-foreground',
              )}
            >
              <Plus className="mr-1 inline h-3 w-3" aria-hidden />
              New view
            </Link>
            {views.map((v) => (
              <Link
                key={v.id}
                href={`/views?view=${encodeURIComponent(v.id)}`}
                aria-current={selected?.id === v.id ? 'page' : undefined}
                className={cn(
                  'max-w-[16rem] truncate rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-accent',
                  selected?.id === v.id && 'bg-accent text-accent-foreground',
                )}
              >
                {v.name}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/* The builder */}
      <section aria-label="Filters" className="space-y-3 rounded-lg border border-border bg-card p-3 sm:p-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Sections</p>
          <div className="flex flex-wrap gap-1.5">
            {sections.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={query.sections.includes(s)}
                onClick={() => set({ sections: toggle(query.sections, s) })}
                className={cn('h-8', query.sections.includes(s) && 'bg-accent text-accent-foreground')}
              >
                {CATEGORIES[s].label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_CHOICES.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={query.statuses.includes(s)}
                onClick={() => set({ statuses: toggle(query.statuses, s) })}
                className={cn('h-8', query.statuses.includes(s) && 'bg-accent text-accent-foreground')}
              >
                {statusText(s)}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          {(tags.length > 0 || query.tags.length > 0) && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Tags (all of)</p>
              <TagFilter tags={tags} selected={query.tags} onChange={(t) => set({ tags: t })} />
            </div>
          )}
          {(genres.length > 0 || query.genres.length > 0) && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Genres (any of)</p>
              <GenrePicker genres={genres} selected={query.genres} onChange={(g) => set({ genres: g })} />
            </div>
          )}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Length up to (min)</p>
            <NumberField label="Longest length in minutes" value={query.maxMinutes} onChange={(v) => set({ maxMinutes: v })} min={1} max={100000} placeholder="Any" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Score (0–10)</p>
            <div className="flex items-center gap-1.5">
              <NumberField label="Lowest score" value={query.scoreMin} onChange={(v) => set({ scoreMin: v })} min={0} max={10} step={0.1} placeholder="0" />
              <span className="text-muted-foreground">–</span>
              <NumberField label="Highest score" value={query.scoreMax} onChange={(v) => set({ scoreMax: v })} min={0} max={10} step={0.1} placeholder="10" />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Year</p>
            <div className="flex items-center gap-1.5">
              <NumberField label="From year" value={query.yearMin} onChange={(v) => set({ yearMin: v })} min={1000} max={3000} placeholder="From" />
              <span className="text-muted-foreground">–</span>
              <NumberField label="To year" value={query.yearMax} onChange={(v) => set({ yearMax: v })} min={1000} max={3000} placeholder="To" />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Sort</p>
            <Select value={query.sort} onValueChange={(v) => set({ sort: v as ViewSort })}>
              <SelectTrigger aria-label="Sort" className="h-10 w-44 md:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIEW_SORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {VIEW_SORT_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setQuery({ ...EMPTY_VIEW, sort: query.sort })}>
            <X className="mr-1 h-4 w-4" aria-hidden />
            Clear filters
          </Button>
        </div>

        {/* Saving */}
        <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:flex-wrap sm:items-center">
          {selected && renaming === null && (
            <>
              <Button type="button" size="sm" disabled={busy || !dirty} onClick={() => void run(() => updateViewQuery(selected.id, valid), 'View saved.')}>
                <Save className="mr-2 h-4 w-4" aria-hidden />
                Save changes
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setRenaming(selected.name)}>
                <PencilLine className="mr-2 h-4 w-4" aria-hidden />
                Rename
              </Button>
              {confirmDelete ? (
                <span className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void run(() => deleteView(selected.id), 'View deleted.', () => router.push('/views'))}
                  >
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" aria-hidden />}
                    Delete “{selected.name}”
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </Button>
                </span>
              ) : (
                <Button type="button" size="sm" variant="ghost" className="text-muted-foreground hover:text-rose-500" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                  Delete
                </Button>
              )}
            </>
          )}
          {selected && renaming !== null && (
            <form
              className="flex w-full items-center gap-2 sm:w-auto"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => renameView(selected.id, renaming), 'View renamed.', () => setRenaming(null));
              }}
            >
              <Input
                autoFocus
                aria-label="View name"
                value={renaming}
                maxLength={MAX_VIEW_NAME}
                onChange={(e) => setRenaming(e.target.value)}
                className="h-9 min-w-0 flex-1 text-base sm:w-56 sm:text-sm"
              />
              <Button type="submit" size="sm" disabled={busy || !renaming.trim()}>
                <Check className="mr-2 h-4 w-4" aria-hidden />
                Rename
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
            </form>
          )}
          <form
            className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto"
            onSubmit={(e) => {
              e.preventDefault();
              void saveNew();
            }}
          >
            <Input
              aria-label="New view name"
              placeholder={selected ? 'Save as a new view…' : 'Name this view…'}
              value={name}
              maxLength={MAX_VIEW_NAME}
              onChange={(e) => setName(e.target.value)}
              className="h-9 min-w-0 flex-1 text-base sm:w-56 sm:text-sm"
            />
            <Button type="submit" size="sm" variant={selected ? 'outline' : 'default'} disabled={busy || !name.trim()}>
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              Save view
            </Button>
          </form>
        </div>
      </section>

      {/* Results */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {results.length} {results.length === 1 ? 'title' : 'titles'}
        </p>
        <ViewToggle value={layout} onChange={setLayout} modes={['grid', 'list']} />
      </div>
      {library.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          Your library is empty. Add some titles first.
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          <Filter className="h-6 w-6" aria-hidden />
          Nothing matches these filters.
        </div>
      ) : layout === 'list' ? (
        <MediaTable units={toDisplayUnits(results, false)} onSelect={openTitle} hrefFor={hrefFor} expanded={NO_EXPANDED} onToggleGroup={() => {}} />
      ) : (
        <MediaGrid units={toDisplayUnits(results, false)} onSelect={openTitle} hrefFor={hrefFor} expanded={NO_EXPANDED} onToggleGroup={() => {}} />
      )}

      <ActivityDetailDialog activity={opened} onClose={() => setOpenId(null)} />
    </div>
  );
}

/** Genres to match (any of them). */
function GenrePicker({ genres, selected, onChange }: { genres: string[]; selected: string[]; onChange: (next: string[]) => void }) {
  const isOn = (g: string) => selected.some((s) => tagKey(s) === tagKey(g));
  const all = [...genres, ...selected.filter((s) => !genres.some((g) => tagKey(g) === tagKey(s)))];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className={cn('h-10 md:h-9', selected.length > 0 && 'bg-accent text-accent-foreground')}>
          {selected.length === 0 ? 'Genres' : selected.length === 1 ? selected[0] : `${selected.length} genres`}
          <ChevronDown className="ml-2 h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Titles with any of these genres</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {all.map((g) => (
          <DropdownMenuCheckboxItem
            key={g}
            checked={isOn(g)}
            onCheckedChange={() => onChange(isOn(g) ? selected.filter((s) => tagKey(s) !== tagKey(g)) : [...selected, g])}
            onSelect={(e) => e.preventDefault()}
          >
            {g}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Clear genres</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
