'use client';

// The diary page (spec 3.4): every finished run, grouped by month and
// filterable by section and year. Entries can be edited, deleted (after an
// in-app confirm) and added by hand for a past watch.

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ImageOff, Loader2, NotebookPen, PencilLine, Plus, Repeat, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useDisplayTitle, useScoreFormat } from '@/components/prefs-provider';
import { RatingInput } from '@/components/rating-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { addDiaryEntry, deleteDiaryEntry, updateDiaryEntry } from '@/lib/actions/diary';
import { CATEGORIES, NAV_ORDER, type CategorySlug } from '@/lib/categories';
import type { DiaryMedia, DiaryRow, LibraryPick } from '@/lib/data-diary';
import { formatYmd, isYmd } from '@/lib/release';
import { groupByMonth } from '@/lib/sessions';
import { doneVerb } from '@/lib/status';
import { matchesTitle } from '@/lib/title';

interface DiaryClientProps {
  entries: DiaryRow[];
  library: LibraryPick[];
  today: string;
}

const ALL = 'ALL';

export function DiaryClient({ entries, library, today }: DiaryClientProps) {
  const router = useRouter();
  const titleOf = useDisplayTitle();
  const { score } = useScoreFormat();
  const [section, setSection] = useState<string>(ALL);
  const [year, setYear] = useState<string>(ALL);
  const [editing, setEditing] = useState<DiaryRow | null>(null);
  const [deleting, setDeleting] = useState<DiaryRow | null>(null);
  const [adding, setAdding] = useState(false);

  const years = useMemo(
    () => [...new Set(entries.map((e) => e.date.slice(0, 4)))].sort().reverse(),
    [entries],
  );
  const sections = NAV_ORDER.filter((s) => entries.some((e) => e.category === s));
  const visible = entries.filter(
    (e) => (section === ALL || e.category === section) && (year === ALL || e.date.startsWith(year)),
  );
  const months = groupByMonth(visible);

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Diary</h1>
        <p className="text-sm text-muted-foreground">
          Every time you finished something, one line each. Rewatches included.
        </p>
        <p className="text-xs text-muted-foreground">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => setAdding(true)} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Log a past one
        </Button>
        <Select value={section} onValueChange={setSection}>
          <SelectTrigger aria-label="Section" className="h-10 w-[calc(50%-0.25rem)] sm:ml-auto sm:h-9 sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sections</SelectItem>
            {sections.map((s) => (
              <SelectItem key={s} value={s}>
                {CATEGORIES[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger aria-label="Year" className="h-10 w-[calc(50%-0.25rem)] sm:h-9 sm:w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All years</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <NotebookPen className="h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="font-medium">Nothing in the diary yet.</p>
          <p className="text-sm text-muted-foreground">Finish a title and it shows up here, or log a past one.</p>
        </div>
      ) : months.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Nothing matches your filters.
        </p>
      ) : (
        <div className="space-y-6">
          {months.map((m) => (
            <section key={m.key} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {m.label} <span className="font-normal">· {m.entries.length}</span>
              </h2>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {m.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 p-2 sm:p-3">
                    <span className="w-8 shrink-0 text-center text-lg font-semibold tabular-nums">
                      {Number(e.date.slice(8))}
                    </span>
                    <Cover media={e.media} title={titleOf(e.media)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{titleOf(e.media)}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>
                          {doneVerb(e.category)} · {CATEGORIES[e.category].singular}
                        </span>
                        {e.rewatch && (
                          <span className="inline-flex items-center gap-0.5">
                            <Repeat className="h-3 w-3" aria-hidden /> rewatch
                          </span>
                        )}
                        {e.rating != null && <span className="font-medium text-foreground">{score(e.rating)}</span>}
                      </p>
                      {e.review && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{e.review}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit entry" onClick={() => setEditing(e)}>
                        <PencilLine className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-rose-500"
                        aria-label="Delete entry"
                        onClick={() => setDeleting(e)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <EntryDialog
        key={editing?.id ?? 'edit'}
        open={editing !== null}
        title={editing ? titleOf(editing.media) : ''}
        initial={editing ?? undefined}
        today={today}
        onClose={() => setEditing(null)}
        onSave={async (values) => {
          if (!editing) return false;
          const res = await updateDiaryEntry(editing.id, values);
          if (!res.ok) toast.error(res.error ?? 'Could not save that entry.');
          else {
            toast.success('Entry saved.');
            router.refresh();
          }
          return res.ok;
        }}
      />

      <AddDialog
        open={adding}
        library={library}
        today={today}
        onClose={() => setAdding(false)}
        onAdded={() => router.refresh()}
      />

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this entry?</DialogTitle>
            <DialogDescription>
              {deleting && `${titleOf(deleting.media)} · ${formatYmd(deleting.date)}. This can't be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (!deleting) return;
                const res = await deleteDiaryEntry(deleting.id);
                if (res.ok) {
                  toast.success('Entry deleted.');
                  setDeleting(null);
                  router.refresh();
                } else {
                  toast.error(res.error ?? 'Could not delete that entry.');
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Cover({ media, title }: { media: DiaryMedia; title: string }) {
  return (
    <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-muted ring-1 ring-border">
      {media.imageUrl ? (
        <Image src={media.imageUrl} alt={title} fill sizes="40px" className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImageOff className="h-4 w-4" aria-hidden />
        </div>
      )}
    </div>
  );
}

interface EntryValues {
  date: string;
  rating: number | null;
  rewatch: boolean;
  review: string | null;
}

/** The fields of an entry: day, score, rewatch, review. */
function EntryFields({
  value,
  onChange,
  today,
  idPrefix,
}: {
  value: EntryValues;
  onChange: (v: EntryValues) => void;
  today: string;
  idPrefix: string;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor={`${idPrefix}-date`}>
          Day
        </label>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          value={value.date}
          max={today}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
          className="text-base sm:text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Score</span>
          {value.rating != null && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => onChange({ ...value, rating: null })}
            >
              Clear
            </button>
          )}
        </div>
        <RatingInput value={value.rating} onChange={(rating) => onChange({ ...value, rating })} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.rewatch}
          onChange={(e) => onChange({ ...value, rewatch: e.target.checked })}
          className="h-4 w-4 accent-current"
        />
        A repeat (rewatch, reread, replay)
      </label>
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor={`${idPrefix}-review`}>
          Review
        </label>
        <Textarea
          id={`${idPrefix}-review`}
          value={value.review ?? ''}
          onChange={(e) => onChange({ ...value, review: e.target.value })}
          rows={4}
          maxLength={20_000}
          className="text-base sm:text-sm"
        />
      </div>
    </div>
  );
}

function EntryDialog({
  open,
  title,
  initial,
  today,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initial?: EntryValues;
  today: string;
  onClose: () => void;
  onSave: (v: EntryValues) => Promise<boolean>;
}) {
  const [value, setValue] = useState<EntryValues>(
    initial
      ? { date: initial.date, rating: initial.rating, rewatch: initial.rewatch, review: initial.review }
      : { date: today, rating: null, rewatch: false, review: null },
  );
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6">{title}</DialogTitle>
        </DialogHeader>
        <EntryFields value={value} onChange={setValue} today={today} idPrefix="edit-entry" />
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || !isYmd(value.date)}
            onClick={async () => {
              setSaving(true);
              try {
                if (await onSave(value)) onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const PICK_LIMIT = 30;

/** Log a past watch: pick a title from the library, then the entry. */
function AddDialog({
  open,
  library,
  today,
  onClose,
  onAdded,
}: {
  open: boolean;
  library: LibraryPick[];
  today: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const titleOf = useDisplayTitle();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<LibraryPick | null>(null);
  const [value, setValue] = useState<EntryValues>({ date: today, rating: null, rewatch: false, review: null });
  const [saving, setSaving] = useState(false);

  const matches = useMemo(
    () => (query.trim() ? library.filter((l) => matchesTitle(l.media, query)) : library).slice(0, PICK_LIMIT),
    [library, query],
  );

  const close = () => {
    setQuery('');
    setPicked(null);
    setValue({ date: today, rating: null, rewatch: false, review: null });
    onClose();
  };

  async function save() {
    if (!picked) return;
    setSaving(true);
    try {
      const res = await addDiaryEntry(picked.activityId, value);
      if (res.ok) {
        toast.success(`Logged “${titleOf(picked.media)}”.`);
        onAdded();
        close();
      } else {
        toast.error(res.error ?? 'Could not add that entry.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{picked ? titleOf(picked.media) : 'Log a past one'}</DialogTitle>
          {!picked && <DialogDescription>Pick a title from your library.</DialogDescription>}
        </DialogHeader>
        {picked ? (
          <EntryFields value={value} onChange={setValue} today={today} idPrefix="add-entry" />
        ) : (
          <div className="space-y-2">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your library…"
              aria-label="Search your library"
              className="text-base sm:text-sm"
            />
            {library.length === 0 ? (
              <p className="text-sm text-muted-foreground">Your library is empty. Add a title first.</p>
            ) : matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No title in your library matches.</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {matches.map((l) => (
                  <li key={l.activityId}>
                    <button
                      type="button"
                      onClick={() => setPicked(l)}
                      className="flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-accent"
                    >
                      <Cover media={l.media} title={titleOf(l.media)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{titleOf(l.media)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[CATEGORIES[l.category as CategorySlug].singular, l.media.year].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {picked && (
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setPicked(null)}>
              Back
            </Button>
            <Button type="button" disabled={saving || !isYmd(value.date)} onClick={() => void save()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add to diary
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
