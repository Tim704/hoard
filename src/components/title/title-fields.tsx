'use client';

// ───────────────────────────────────────────────────────────────────────────
//  The pieces a title's details are made of, shared by the short popup and
//  the full title page: the metadata rows, the new-season and Last.fm
//  notices, the hand-made title editor, and one component per field. The
//  editable values live in useTitleEditor (./use-title-editor.ts); the log
//  sections (history, runs, review, sessions) in ./title-log.tsx.
// ───────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Loader2, PencilLine, Sparkles, Star } from 'lucide-react';
import { toast } from 'sonner';

import { AddToList } from '@/components/add-to-list';
import { LabelHeading, type HeadingLevel } from '@/components/heading';
import { LinkPreview, LinkTextarea, MentionedIn } from '@/components/linked-text';
import { ManualFields } from '@/components/manual-fields';
import { MoreBySection } from '@/components/more-by';
import { ProgressField } from '@/components/progress-field';
import { RatingInput } from '@/components/rating-input';
import { TagInput } from '@/components/tag-input';
import { TvSeasons } from '@/components/tv-seasons';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { settle } from '@/lib/action-result';
import { clearListenSuggestion } from '@/lib/actions/accounts';
import { acknowledgeNewSeason } from '@/lib/actions/new-seasons';
import { updateActivity, updateManualEntry } from '@/lib/actions/media';
import type { CategorySlug } from '@/lib/categories';
import { formatPlaytime } from '@/lib/import/sources/steam';
import { isManualId, manualInputFrom, parseManualInput, type ManualInput } from '@/lib/manual';
import { formatTimeToBeat } from '@/lib/media-meta';
import { formatYmd, isYmd } from '@/lib/release';
import { STATUSES, statusLabel, type Status } from '@/lib/status';
import { NEW_FRANCHISE, NO_FRANCHISE } from '@/lib/title-draft';
import type { ActivityWithMedia, MediaItem } from '@/lib/types';
import { cn } from '@/lib/utils';

// ── Metadata ────────────────────────────────────────────────────────────────

/** A single "Label: value" row of media metadata. */
function ExtraRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/** Reads a possibly-present field off the loosely-typed media object. */
function num(media: MediaItem, key: string): number | null {
  const v = media[key];
  return typeof v === 'number' ? v : null;
}
function str(media: MediaItem, key: string): string | null {
  const v = media[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function strArr(media: MediaItem, key: string): string[] {
  const v = media[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Renders whichever category-specific extras are present on the media object.
 * Reads everything defensively so it works for any of the seven domains.
 */
export function MediaExtras({ media, playtimeMinutes }: { media: MediaItem; playtimeMinutes?: number | null }) {
  const rows: React.ReactNode[] = [];

  // 8.1: minutes played on Steam, kept current nightly.
  const playtime = formatPlaytime(playtimeMinutes);
  if (playtime) rows.push(<ExtraRow key="steam" label="Played" value={playtime} />);

  // F2: the full release day when known (the year alone is shown above).
  const releaseDate = str(media, 'releaseDate');
  if (releaseDate && isYmd(releaseDate)) {
    rows.push(<ExtraRow key="released" label="Released" value={formatYmd(releaseDate)} />);
  }

  const genres = strArr(media, 'genres');
  if (genres.length) rows.push(<ExtraRow key="genres" label="Genres" value={genres.join(', ')} />);

  const timeToBeat = formatTimeToBeat(num(media, 'timeToBeatHours'));
  if (timeToBeat) rows.push(<ExtraRow key="timeToBeat" label="Time to beat" value={timeToBeat} />);

  const authors = strArr(media, 'authors');
  if (authors.length) rows.push(<ExtraRow key="authors" label="Authors" value={authors.join(', ')} />);

  const artist = str(media, 'artist');
  if (artist) rows.push(<ExtraRow key="artist" label="Artist" value={artist} />);

  const studio = str(media, 'studio');
  if (studio) rows.push(<ExtraRow key="studio" label="Studio" value={studio} />);

  const platforms = strArr(media, 'platforms');
  if (platforms.length) rows.push(<ExtraRow key="platforms" label="Platforms" value={platforms.join(', ')} />);

  const runtime = num(media, 'runtime');
  if (runtime != null) rows.push(<ExtraRow key="runtime" label="Runtime" value={`${runtime} min`} />);

  const episodes = num(media, 'episodes');
  if (episodes != null) rows.push(<ExtraRow key="episodes" label="Episodes" value={String(episodes)} />);

  const episodeCount = num(media, 'episodeCount');
  if (episodeCount != null) rows.push(<ExtraRow key="episodeCount" label="Episodes" value={String(episodeCount)} />);

  const seasonCount = num(media, 'seasonCount');
  if (seasonCount != null) rows.push(<ExtraRow key="seasonCount" label="Seasons" value={String(seasonCount)} />);

  const chapters = num(media, 'chapters');
  if (chapters != null) rows.push(<ExtraRow key="chapters" label="Chapters" value={String(chapters)} />);

  const volumes = num(media, 'volumes');
  if (volumes != null) rows.push(<ExtraRow key="volumes" label="Volumes" value={String(volumes)} />);

  const pageCount = num(media, 'pageCount');
  if (pageCount != null) rows.push(<ExtraRow key="pageCount" label="Pages" value={String(pageCount)} />);

  const trackCount = num(media, 'trackCount');
  if (trackCount != null) rows.push(<ExtraRow key="trackCount" label="Tracks" value={String(trackCount)} />);

  const tmdbRating = num(media, 'tmdbRating');
  if (tmdbRating != null) rows.push(<ExtraRow key="tmdbRating" label="TMDB" value={tmdbRating.toFixed(1)} />);

  const malScore = num(media, 'malScore');
  if (malScore != null) rows.push(<ExtraRow key="malScore" label="MAL" value={malScore.toFixed(1)} />);

  const igdbRating = num(media, 'igdbRating');
  if (igdbRating != null) rows.push(<ExtraRow key="igdbRating" label="IGDB" value={String(igdbRating)} />);

  if (!rows.length) return null;
  return <div className="space-y-1">{rows}</div>;
}

// ── Notices ─────────────────────────────────────────────────────────────────

/**
 * 5.5: "Season N is out" on a finished show, with "Got it" (records the
 * current season count; starting the show again does the same).
 */
export function NewSeasonNotice({ activityId, season }: { activityId: string; season: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return null;

  async function gotIt() {
    setBusy(true);
    try {
      const res = await settle(acknowledgeNewSeason(activityId));
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not save that.');
      }
    } catch {
      toast.error('Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3">
      <Sparkles className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">New season.</span> Season {season} is out.
      </p>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void gotIt()}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Got it
      </Button>
    </div>
  );
}

/**
 * 8.3: Last.fm says this album was played to 80 % of its tracks. One click
 * marks it Listened; "Not now" stops suggesting it. Never automatic.
 */
export function ListenSuggestion({ activityId, onDone }: { activityId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function act(mark: boolean) {
    setBusy(true);
    try {
      if (mark) {
        const res = await settle(updateActivity(activityId, { status: 'COMPLETED' }));
        if (!res.ok) {
          toast.error(res.error ?? 'Could not save.');
          return;
        }
      }
      await clearListenSuggestion(activityId, !mark);
      if (mark) toast.success('Marked as Listened.');
      onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">Last.fm says you&apos;ve played most of this album. Mark as Listened?</span>
      <Button type="button" size="sm" disabled={busy} onClick={() => void act(true)}>
        Mark as Listened
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void act(false)}>
        Not now
      </Button>
    </div>
  );
}

// ── Description and hand-made details ───────────────────────────────────────

/**
 * Editing a hand-made title's details (spec 1.5). Only offered for manual
 * rows: provider rows are shared catalogue data and are never edited by hand.
 */
export function ManualEditor({
  activity,
  onDone,
}: {
  activity: ActivityWithMedia;
  onDone: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState<ManualInput>(() =>
    manualInputFrom(activity.category, activity.media),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsed = parseManualInput(activity.category, value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await settle(updateManualEntry(activity.id, value));
      if (res.ok) {
        toast.success('Details saved.');
        router.refresh();
        onDone();
      } else {
        setError(res.error ?? 'Could not save those details.');
      }
    } catch {
      setError('Could not save those details.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <ManualFields
        slug={activity.category}
        value={value}
        onChange={setValue}
        disabled={saving}
        idPrefix={`manual-edit-${activity.id}`}
      />
      {error && (
        <p className="text-sm text-rose-500" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save details
        </Button>
      </div>
    </div>
  );
}

/**
 * The description, and for a hand-made title "Edit details" (which swaps in
 * the ManualEditor). Render with `key={activity.id}`.
 */
export function DescriptionField({
  activity,
  disabled,
  descriptionClassName = 'line-clamp-5 text-sm text-muted-foreground',
}: {
  activity: ActivityWithMedia;
  disabled?: boolean;
  descriptionClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const { media } = activity;
  if (editing) {
    return <ManualEditor key={activity.id} activity={activity} onDone={() => setEditing(false)} />;
  }
  return (
    <>
      {media.description && <p className={descriptionClassName}>{media.description}</p>}
      {isManualId(media.externalId) && (
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setEditing(true)}>
          <PencilLine className="mr-2 h-4 w-4" aria-hidden />
          Edit details
        </Button>
      )}
    </>
  );
}

// ── The editable fields ─────────────────────────────────────────────────────

export function StatusField({
  value,
  onChange,
  category,
}: {
  value: Status;
  onChange: (s: Status) => void;
  category: CategorySlug;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">Status</label>
      <Select value={value} onValueChange={(v) => onChange(v as Status)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {statusLabel(s, category)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** The user's score for the title (the "Rating" field). */
export function ScoreField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Rating</label>
        {value != null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      <RatingInput value={value} onChange={(v) => onChange(v)} />
    </div>
  );
}

export function FavouriteField({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">Favorite</label>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={value}
          onClick={onToggle}
          className={cn(value && 'border-amber-500/40 text-amber-300')}
        >
          <Star className={cn('mr-2 h-4 w-4', value && 'fill-current')} aria-hidden />
          {value ? 'Favorited' : 'Mark favorite'}
        </Button>
      </div>
    </div>
  );
}

export function FranchiseField({
  value,
  onChange,
  franchises,
  disabled,
  locked,
}: {
  value: string;
  onChange: (value: string) => void;
  franchises: { id: string; name: string }[];
  disabled?: boolean;
  /** Set by hand: automatic detection leaves it alone. */
  locked?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium">
        <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        Franchise
      </label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_FRANCHISE}>No franchise</SelectItem>
          {franchises.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
          <SelectItem value={NEW_FRANCHISE}>+ New franchise from this title</SelectItem>
        </SelectContent>
      </Select>
      {locked && (
        <p className="text-xs text-muted-foreground">
          Set by hand. Automatic detection leaves it alone.
        </p>
      )}
    </div>
  );
}

/** Private notes with `[[Title]]` autocomplete and a live preview of the links. */
export function NotesField({
  activity,
  value,
  onChange,
  rows = 3,
  headingLevel,
}: {
  activity: ActivityWithMedia;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  /** The label is also its panel's heading (the title page). */
  headingLevel?: HeadingLevel;
}) {
  return (
    <div className="space-y-1.5">
      <LabelHeading level={headingLevel}>
        <label className="text-sm font-medium" htmlFor={`notes-${activity.id}`}>
          Notes
        </label>
      </LabelHeading>
      <LinkTextarea
        id={`notes-${activity.id}`}
        value={value}
        onValueChange={onChange}
        selfId={activity.id}
        placeholder="Private notes… [[Title]] links another title"
        // text-base on phones stops iOS zooming the page on focus (<16px does).
        className="text-base sm:text-sm"
        rows={rows}
      />
      <LinkPreview text={value} from={activity} />
    </div>
  );
}

/** Tags, saved as they change. Render with `key={`tags:${activity.id}`}`. */
export function TagsField({
  activity,
  disabled,
  headingLevel,
}: {
  activity: ActivityWithMedia;
  disabled?: boolean;
  headingLevel?: HeadingLevel;
}) {
  return <TagInput activityId={activity.id} initial={activity.tags} disabled={disabled} headingLevel={headingLevel} />;
}

/** The custom lists the title is on. Render with `key={`lists:${activity.id}`}`. */
export function AddToListField({ activity, disabled }: { activity: ActivityWithMedia; disabled?: boolean }) {
  return <AddToList activityId={activity.id} disabled={disabled} />;
}

/**
 * Progress (pages, episodes, …): saves as it changes. A TV show with seasons
 * is tracked by its Seasons section, so it is read-only then (`seasonTracked`).
 */
export function TitleProgressField({
  activity,
  disabled,
  seasonTracked,
  onMarkFinished,
  headingLevel,
}: {
  activity: ActivityWithMedia;
  disabled?: boolean;
  seasonTracked?: boolean;
  onMarkFinished: () => void;
  headingLevel?: HeadingLevel;
}) {
  return (
    // A stable wrapper, so the keyed remount below stays in place.
    <div className="empty:hidden">
      <ProgressField
        // TV progress also changes from the Seasons section: remount on a new value.
        key={activity.category === 'tv' ? `${activity.id}:${activity.progress}` : activity.id}
        activity={activity}
        disabled={disabled}
        readOnlyHint={seasonTracked ? 'Tracked by seasons' : undefined}
        onMarkFinished={onMarkFinished}
        headingLevel={headingLevel}
      />
    </div>
  );
}

/** A TV show's Seasons (nothing for other sections). */
export function SeasonsField({
  activity,
  disabled,
  onLoaded,
  headingLevel,
}: {
  activity: ActivityWithMedia;
  disabled?: boolean;
  onLoaded?: (hasSeasons: boolean) => void;
  headingLevel?: HeadingLevel;
}) {
  if (activity.category !== 'tv') return null;
  return (
    <TvSeasons
      key={`seasons:${activity.id}`}
      activityId={activity.id}
      disabled={disabled}
      onLoaded={onLoaded}
      headingLevel={headingLevel}
    />
  );
}

/** The titles whose notes or reviews link here. */
export function MentionedInField({ activity }: { activity: ActivityWithMedia }) {
  return <MentionedIn key={`mentions:${activity.id}`} activityId={activity.id} />;
}

/** More by the same people (provider titles only; a hand-made one has no credits). */
export function MoreByField({ activity, headingLevel }: { activity: ActivityWithMedia; headingLevel?: 2 | 3 }) {
  if (isManualId(activity.media.externalId)) return null;
  return <MoreBySection key={`more-by:${activity.id}`} activityId={activity.id} headingLevel={headingLevel} />;
}
