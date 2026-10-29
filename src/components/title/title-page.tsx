'use client';

// ───────────────────────────────────────────────────────────────────────────
//  A title's full page (/<section>/title/<id>): everything the short popup
//  leaves out. The poster on the left (in Fresh one blurred backdrop behind
//  the header, the only blur on the page) and the editable basics on the
//  right; Notes | History; Tags · Lists; then Progress, Seasons, Format,
//  Review, Play sessions and More by.
//
//  Status, rating, favourite, notes and franchise save together: a sticky
//  bar with Save and Discard appears while any of them has unsaved edits.
//  Leaving the page keeps those edits for the tab (useTitleEditor's drafts):
//  coming back shows them again, still unsaved. Everything else (tags,
//  lists, progress, seasons, format, review, sessions) saves as it changes.
// ───────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ImageOff, ListPlus, Loader2, Trash2, type LucideIcon } from 'lucide-react';

import { useDisplayTitle, useLayout } from '@/components/prefs-provider';
import { Button } from '@/components/ui/button';
import { showsListenBadge } from '@/lib/lastfm-suggest';
import { mediaSubtitle } from '@/lib/media-meta';
import { formatOptions } from '@/lib/ownership';
import { tracksProgress } from '@/lib/progress';
import type { TitleValues } from '@/lib/title-draft';
import type { ActivityWithMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

import {
  AddToListField,
  DescriptionField,
  FavouriteField,
  FranchiseField,
  ListenSuggestion,
  MediaExtras,
  MentionedInField,
  MoreByField,
  NewSeasonNotice,
  NotesField,
  ScoreField,
  SeasonsField,
  StatusField,
  TagsField,
  TitleProgressField,
} from './title-fields';
import { HistoryHeading, HistoryList, LogFailed, OwnershipField, ReviewField, Runs, Sessions } from './title-log';
import { useActivityLog } from './use-activity-log';
import { useTitleEditor } from './use-title-editor';

const FIELD_NAMES: Record<keyof TitleValues, string> = {
  status: 'Status',
  rating: 'Rating',
  favorite: 'Favorite',
  notes: 'Notes',
  franchiseId: 'Franchise',
};

/** Full-bleed bands on phones (the content as wide as the popup's), cards from sm. */
const PANEL = '-mx-4 min-w-0 space-y-4 border-x-0 border-y border-border bg-card p-4 sm:mx-0 sm:rounded-lg sm:border-x sm:p-5';

/**
 * One block of the page; hidden when what it holds renders nothing. Not a
 * named region: the fields inside carry their own labels and headings.
 */
function Panel({ className, children, label }: { className?: string; children: React.ReactNode; label: string }) {
  return (
    <section data-panel={label} className={cn(PANEL, 'empty:hidden', className)}>
      {children}
    </section>
  );
}

/** A panel's heading, styled like the fields' labels. */
function PanelTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-1.5 text-sm font-medium">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {children}
    </h2>
  );
}

export function TitlePage({
  activity,
  franchises,
  sectionLabel,
}: {
  activity: ActivityWithMedia;
  franchises: { id: string; name: string }[];
  /** The section's name, for the back link ("Books"). */
  sectionLabel: string;
}) {
  const router = useRouter();
  const titleOf = useDisplayTitle();
  const fresh = useLayout().id === 'fresh';
  const slug = activity.category;
  const sectionHref = `/${slug}`;
  const editor = useTitleEditor(activity, {
    keepDrafts: true,
    onRemoved: () => router.replace(sectionHref),
  });
  const { log, failed, reload } = useActivityLog(activity.id);
  // A TV show with seasons: its progress is their sum (read-only here).
  const [seasonTracked, setSeasonTracked] = useState(false);

  const { media } = activity;
  const title = titleOf(media);
  const meta = [media.year != null ? String(media.year) : null, mediaSubtitle(media, slug)].filter(Boolean).join(' · ');
  const { busy } = editor;
  const logChanged = () => {
    void reload();
    router.refresh();
  };
  const hasOwnership = slug === 'games' || formatOptions(slug).length > 0;

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 sm:p-6">
        <Link
          href={sectionHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {sectionLabel}
        </Link>

        <header className={cn('relative isolate', fresh && media.imageUrl && 'overflow-hidden rounded-xl p-4 sm:p-6')}>
          {fresh && media.imageUrl && (
            // Fresh's cinematic hero: the poster, blurred, behind the header.
            <div aria-hidden data-title-backdrop="" className="pointer-events-none absolute inset-0 -z-10">
              <Image src={media.imageUrl} alt="" fill sizes="320px" className="scale-125 object-cover opacity-60 blur-2xl" />
              <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/75 to-background" />
            </div>
          )}
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-x-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
            <div className="relative aspect-[2/3] w-full self-start overflow-hidden rounded-lg bg-muted shadow-sm sm:row-span-2">
              {media.imageUrl ? (
                <Image
                  src={media.imageUrl}
                  alt={title}
                  fill
                  priority
                  sizes="(max-width: 640px) 96px, (max-width: 1024px) 160px, 208px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageOff className="h-8 w-8" aria-hidden />
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-2">
              <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
              {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
              <MediaExtras media={media} playtimeMinutes={activity.playtimeMinutes} />
            </div>

            <div className="col-span-2 min-w-0 space-y-5 sm:col-span-1 sm:col-start-2">
              {showsListenBadge(activity) && <ListenSuggestion activityId={activity.id} onDone={() => router.refresh()} />}
              {activity.newSeason != null && (
                <NewSeasonNotice key={`new-season:${activity.id}`} activityId={activity.id} season={activity.newSeason} />
              )}
              <div className="grid gap-5 lg:grid-cols-2">
                <StatusField value={editor.status} onChange={editor.setStatus} category={slug} />
                <ScoreField value={editor.rating} onChange={editor.setRating} />
                <FavouriteField value={editor.favorite} onToggle={() => editor.setFavorite(!editor.favorite)} />
                <FranchiseField
                  value={editor.franchiseId}
                  onChange={editor.setFranchise}
                  franchises={franchises}
                  disabled={busy}
                  locked={activity.franchiseLocked}
                />
              </div>
              <div className="space-y-3 empty:hidden">
                <DescriptionField
                  key={`details:${activity.id}`}
                  activity={activity}
                  disabled={busy}
                  descriptionClassName="whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground"
                />
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <Panel label="Notes">
            <NotesField activity={activity} value={editor.notes} onChange={editor.setNotes} rows={6} />
            <MentionedInField activity={activity} />
          </Panel>
          <Panel label="History">
            <HistoryHeading as="h2" />
            {failed && <LogFailed />}
            {log && (
              <>
                <Runs activity={activity} log={log} disabled={busy} onDone={logChanged} />
                <HistoryList activity={activity} log={log} showHeading={false} />
                {log.events.length === 0 && log.diary.length === 0 && (
                  <p className="text-sm text-muted-foreground">No history yet.</p>
                )}
              </>
            )}
            {!log && !failed && <p className="text-sm text-muted-foreground">Loading the history…</p>}
          </Panel>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Panel label="Tags">
            <TagsField key={`tags:${activity.id}`} activity={activity} disabled={busy} />
          </Panel>
          <Panel label="Lists">
            <PanelTitle icon={ListPlus}>Lists</PanelTitle>
            <AddToListField key={`lists:${activity.id}`} activity={activity} disabled={busy} />
          </Panel>
        </div>

        {/* Two columns from md; panels that render nothing are hidden. */}
        <div className="grid items-start gap-6 empty:hidden md:grid-cols-2">
          {tracksProgress(slug) && (
            <Panel label="Progress" className={cn(slug === 'tv' && 'md:col-span-2')}>
              <TitleProgressField
                activity={activity}
                disabled={busy}
                seasonTracked={seasonTracked}
                onMarkFinished={() => {
                  editor.setStatus('COMPLETED');
                  void editor.save('COMPLETED');
                }}
              />
            </Panel>
          )}

          {slug === 'tv' && (
            <Panel label="Seasons" className="md:col-span-2">
              <SeasonsField activity={activity} disabled={busy} onLoaded={setSeasonTracked} />
            </Panel>
          )}

          {hasOwnership && (
            <Panel label={slug === 'games' ? 'Owned on' : 'Format'}>
              <OwnershipField key={`own:${activity.id}`} activity={activity} disabled={busy} />
            </Panel>
          )}

          {slug === 'games' && log && (
            <Sessions activityId={activity.id} log={log} onChanged={logChanged} className={cn(PANEL, 'rounded-none')} />
          )}

          {log && log.diary.length > 0 && (
            <Panel label="Review">
              <ReviewField
                key={log.diary[0].id}
                activityId={activity.id}
                category={slug}
                initial={log.diary[0].review ?? ''}
                onSaved={logChanged}
              />
            </Panel>
          )}
        </div>

        <Panel label="More by the same people">
          <MoreByField activity={activity} />
        </Panel>

        <div className="flex justify-start border-t border-border pt-6">
          <Button type="button" variant="destructive" onClick={() => void editor.remove()} disabled={busy}>
            {editor.removing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" aria-hidden />}
            Remove
          </Button>
        </div>
      </div>

      {editor.dirty && (
        <div
          role="region"
          aria-label="Unsaved changes"
          data-save-bar=""
          className="sticky bottom-0 z-30 border-t border-border bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_30px_-15px_rgb(0_0_0/0.45)] sm:px-6"
        >
          <div className="mx-auto flex max-w-5xl items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm">
              <span className="font-medium">Unsaved changes</span>
              <span className="hidden text-muted-foreground sm:inline"> · {editor.changed.map((k) => FIELD_NAMES[k]).join(', ')}</span>
            </p>
            <Button type="button" variant="ghost" onClick={editor.discard} disabled={busy}>
              Discard
            </Button>
            <Button type="button" onClick={() => void editor.save()} disabled={busy}>
              {editor.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
