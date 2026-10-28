'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ImageOff, Layers, Loader2, PencilLine, Sparkles, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ActivityExtras } from '@/components/activity-extras';
import { AddToList } from '@/components/add-to-list';
import { ManualFields } from '@/components/manual-fields';
import { MoreBySection } from '@/components/more-by';
import { useDisplayTitle } from '@/components/prefs-provider';
import { ProgressField } from '@/components/progress-field';
import { SubScoresSection } from '@/components/sub-scores';
import { TagInput } from '@/components/tag-input';
import { TvSeasons } from '@/components/tv-seasons';
import { WhereToWatch } from '@/components/where-to-watch';
import { RatingInput } from '@/components/rating-input';
import { toastRemoved, toastStatusChange } from '@/components/undo-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { clearListenSuggestion } from '@/lib/actions/accounts';
import { assignFranchise } from '@/lib/actions/franchise';
import { acknowledgeNewSeason } from '@/lib/actions/new-seasons';
import { removeActivity, updateActivity, updateManualEntry } from '@/lib/actions/media';
import { formatPlaytime } from '@/lib/import/sources/steam';
import { showsListenBadge } from '@/lib/lastfm-suggest';
import { isManualId, manualInputFrom, parseManualInput, type ManualInput } from '@/lib/manual';
import { formatTimeToBeat } from '@/lib/media-meta';
import { formatYmd, isYmd } from '@/lib/release';
import { STATUSES, statusLabel, type Status } from '@/lib/status';
import { isStreamable } from '@/lib/streaming';
import type { ActivityWithMedia, MediaItem } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ActivityDetailDialogProps {
  activity: ActivityWithMedia | null;
  onClose: () => void;
  /** The user's franchises, for moving this title into one by hand. */
  franchises?: { id: string; name: string }[];
}

const NO_FRANCHISE = '__none';
const NEW_FRANCHISE = '__new';

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
function MediaExtras({ media, playtimeMinutes }: { media: MediaItem; playtimeMinutes?: number | null }) {
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

/**
 * 5.5: "Season N is out" on a finished show, with "Got it" (records the
 * current season count; starting the show again does the same).
 */
function NewSeasonNotice({ activityId, season }: { activityId: string; season: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return null;

  async function gotIt() {
    setBusy(true);
    try {
      const res = await acknowledgeNewSeason(activityId);
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
 * Editing a hand-made title's details (spec 1.5). Only offered for manual
 * rows: provider rows are shared catalogue data and are never edited by hand.
 */
function ManualEditor({
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
      const res = await updateManualEntry(activity.id, value);
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
 * Controlled detail dialog: edit status / rating / favorite / notes, or remove
 * the item entirely. Open when `activity` is non-null.
 */
export function ActivityDetailDialog({
  activity,
  onClose,
  franchises = [],
}: ActivityDetailDialogProps) {
  const router = useRouter();
  const titleOf = useDisplayTitle();

  const [status, setStatus] = useState<Status>('PLANNED');
  const [rating, setRating] = useState<number | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [notes, setNotes] = useState('');

  const [franchiseId, setFranchiseId] = useState<string>(NO_FRANCHISE);

  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [moving, setMoving] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  // The TV title whose Seasons section has seasons: its progress is their sum.
  const [seasonTracked, setSeasonTracked] = useState<string | null>(null);

  // Re-sync local editable state whenever a different activity is selected.
  // Keyed on the id so a background refresh doesn't wipe unsaved edits.
  useEffect(() => {
    if (activity) {
      setStatus(activity.status);
      setRating(activity.rating);
      setFavorite(activity.favorite);
      setNotes(activity.notes ?? '');
      setEditingDetails(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.id]);

  // The franchise saves immediately, so always mirror the server's value.
  useEffect(() => {
    setFranchiseId(activity?.franchise?.id ?? NO_FRANCHISE);
  }, [activity?.id, activity?.franchise?.id]);

  if (!activity) {
    // Render a closed, controlled dialog so transitions stay mounted.
    return <Dialog open={false} onOpenChange={(o) => !o && onClose()} />;
  }

  const { media } = activity;
  const title = titleOf(media);
  const busy = saving || removing || moving;

  // Franchise changes apply immediately (independent of Save) and are locked
  // so automatic detection never undoes them.
  async function changeFranchise(value: string) {
    if (!activity) return;
    const previous = franchiseId;
    setFranchiseId(value);
    setMoving(true);
    try {
      const target = value === NO_FRANCHISE ? null : value === NEW_FRANCHISE ? 'new' : value;
      const res = await assignFranchise(activity.id, target);
      if (res.ok) {
        toast.success(target ? 'Franchise updated.' : 'Removed from franchise.');
        router.refresh();
      } else {
        setFranchiseId(previous);
        toast.error(res.error ?? 'Could not change the franchise.');
      }
    } finally {
      setMoving(false);
    }
  }

  // `statusOverride`: "Mark as finished" saves with the finished status.
  async function save(statusOverride?: Status) {
    if (!activity) return;
    const nextStatus = statusOverride ?? status;
    setSaving(true);
    try {
      const res = await updateActivity(activity.id, {
        status: nextStatus,
        rating,
        favorite,
        notes,
      });
      if (res.ok) {
        const refresh = () => router.refresh();
        if (nextStatus !== activity.status) {
          toastStatusChange(
            `Marked “${title}” as ${statusLabel(nextStatus, activity.category)}.`,
            activity.id,
            res.previous,
            refresh,
          );
        } else {
          toast.success('Saved.');
        }
        refresh();
        onClose();
      } else {
        toast.error(res.error ?? 'Could not save changes.');
      }
    } catch {
      toast.error('Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!activity) return;
    setRemoving(true);
    try {
      const res = await removeActivity(activity.id);
      if (res.ok) {
        toastRemoved(title, res.undoToken, () => router.refresh());
        router.refresh();
        onClose();
      } else {
        toast.error(res.error ?? 'Could not remove that item.');
      }
    } catch {
      toast.error('Could not remove that item.');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* Mobile: dock to the bottom edge as a sheet — the body scrolls inside
          while the Save/Remove footer stays pinned. sm+ is the centered
          dialog, which scrolls the same way once the history grows. */}
      <DialogContent className="bottom-0 top-auto flex max-h-[92dvh] max-w-full translate-y-0 flex-col overflow-hidden rounded-t-2xl border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-auto sm:top-[50%] sm:max-h-[90dvh] sm:max-w-2xl sm:translate-y-[-50%] sm:border-b sm:p-6">
        <DialogHeader>
          <DialogTitle className="pr-6">{title}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 grid grid-cols-1 gap-5 overflow-y-auto sm:grid-cols-[160px_minmax(0,1fr)] sm:items-start">
          {/* Poster + metadata — a compact horizontal row on phones, the
              original stacked column at sm+. */}
          <div className="flex gap-4 sm:block sm:space-y-3">
            <div className="relative aspect-[2/3] w-28 shrink-0 self-start overflow-hidden rounded-md bg-muted sm:w-full">
              {media.imageUrl ? (
                <Image
                  src={media.imageUrl}
                  alt={title}
                  fill
                  sizes="(max-width: 640px) 112px, 160px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageOff className="h-8 w-8" aria-hidden />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2 sm:space-y-3">
              {media.year != null && (
                <p className="text-sm text-muted-foreground">{media.year}</p>
              )}
              <MediaExtras media={media} playtimeMinutes={activity.playtimeMinutes} />
            </div>
          </div>

          {/* Editable controls */}
          <div className="space-y-4">
            {showsListenBadge(activity) && (
              <ListenSuggestion activityId={activity.id} onDone={() => router.refresh()} />
            )}
            {editingDetails ? (
              <ManualEditor
                key={activity.id}
                activity={activity}
                onDone={() => setEditingDetails(false)}
              />
            ) : (
              <>
                {media.description && (
                  <p className="line-clamp-5 text-sm text-muted-foreground">
                    {media.description}
                  </p>
                )}
                {isManualId(media.externalId) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setEditingDetails(true)}
                  >
                    <PencilLine className="mr-2 h-4 w-4" aria-hidden />
                    Edit details
                  </Button>
                )}
              </>
            )}

            {activity.newSeason != null && (
              <NewSeasonNotice key={`new-season:${activity.id}`} activityId={activity.id} season={activity.newSeason} />
            )}

            {isStreamable(activity.category) && (
              <WhereToWatch key={`watch:${activity.id}`} activityId={activity.id} />
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel(s, activity.category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* A stable wrapper, so the keyed remount below stays in place. */}
            <div className="empty:hidden">
              <ProgressField
                // TV progress also changes from the Seasons section: remount on a new value.
                key={activity.category === 'tv' ? `${activity.id}:${activity.progress}` : activity.id}
                activity={activity}
                disabled={busy}
                readOnlyHint={seasonTracked === activity.id ? 'Tracked by seasons' : undefined}
                onMarkFinished={() => {
                  setStatus('COMPLETED');
                  void save('COMPLETED');
                }}
              />
            </div>

            {activity.category === 'tv' && (
              <TvSeasons
                key={`seasons:${activity.id}`}
                activityId={activity.id}
                disabled={busy}
                onLoaded={(has) => setSeasonTracked(has ? activity.id : null)}
              />
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Rating</label>
                {rating != null && (
                  <button
                    type="button"
                    onClick={() => setRating(null)}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <RatingInput value={rating} onChange={(v) => setRating(v)} />
            </div>

            <SubScoresSection
              key={`subscores:${activity.id}`}
              activityId={activity.id}
              slug={activity.category}
              initial={activity.subScores}
              disabled={busy}
              onUseAsScore={(v) => setRating(v)}
            />

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                Franchise
              </label>
              <Select value={franchiseId} onValueChange={changeFranchise} disabled={busy}>
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
              {activity.franchiseLocked && (
                <p className="text-xs text-muted-foreground">
                  Set by hand. Automatic detection leaves it alone.
                </p>
              )}
            </div>

            <TagInput key={`tags:${activity.id}`} activityId={activity.id} initial={activity.tags} disabled={busy} />

            <AddToList key={`lists:${activity.id}`} activityId={activity.id} disabled={busy} />

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Favorite</label>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={favorite}
                  onClick={() => setFavorite((f) => !f)}
                  className={cn(favorite && 'border-amber-500/40 text-amber-300')}
                >
                  <Star
                    className={cn('mr-2 h-4 w-4', favorite && 'fill-current')}
                    aria-hidden
                  />
                  {favorite ? 'Favorited' : 'Mark favorite'}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Private notes…"
                // text-base on phones stops iOS zooming the page on focus (<16px does).
                className="text-base sm:text-sm"
                rows={3}
              />
            </div>

            {!isManualId(media.externalId) && <MoreBySection key={`more-by:${activity.id}`} activityId={activity.id} />}

            <ActivityExtras key={`extras:${activity.id}`} activity={activity} disabled={busy} onClose={onClose} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="destructive"
            onClick={remove}
            disabled={busy}
          >
            {removing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Remove
          </Button>
          <Button type="button" onClick={() => save()} disabled={busy}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 8.3: Last.fm says this album was played to 80 % of its tracks. One click
 * marks it Listened; "Not now" stops suggesting it. Never automatic.
 */
function ListenSuggestion({ activityId, onDone }: { activityId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function act(mark: boolean) {
    setBusy(true);
    try {
      if (mark) {
        const res = await updateActivity(activityId, { status: 'COMPLETED' });
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
