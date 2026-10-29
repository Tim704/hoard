'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ImageOff, Loader2, Trash2 } from 'lucide-react';

import { useDisplayTitle } from '@/components/prefs-provider';
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
} from '@/components/title/title-fields';
import { ActivityExtras } from '@/components/title/title-log';
import { useTitleEditor } from '@/components/title/use-title-editor';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { showsListenBadge } from '@/lib/lastfm-suggest';
import type { ActivityWithMedia } from '@/lib/types';

interface ActivityDetailDialogProps {
  activity: ActivityWithMedia | null;
  onClose: () => void;
  /** The user's franchises, for moving this title into one by hand. */
  franchises?: { id: string; name: string }[];
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
  const editor = useTitleEditor(activity, { onDone: onClose });
  // The TV title whose Seasons section has seasons: its progress is their sum.
  const [seasonTracked, setSeasonTracked] = useState<string | null>(null);

  if (!activity) {
    // Render a closed, controlled dialog so transitions stay mounted.
    return <Dialog open={false} onOpenChange={(o) => !o && onClose()} />;
  }

  const { media } = activity;
  const title = titleOf(media);
  const { busy } = editor;

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
            <DescriptionField key={`details:${activity.id}`} activity={activity} disabled={busy} />

            {activity.newSeason != null && (
              <NewSeasonNotice key={`new-season:${activity.id}`} activityId={activity.id} season={activity.newSeason} />
            )}

            <StatusField value={editor.status} onChange={editor.setStatus} category={activity.category} />

            <TitleProgressField
              activity={activity}
              disabled={busy}
              seasonTracked={seasonTracked === activity.id}
              onMarkFinished={() => {
                editor.setStatus('COMPLETED');
                void editor.save('COMPLETED');
              }}
            />

            <SeasonsField
              activity={activity}
              disabled={busy}
              onLoaded={(has) => setSeasonTracked(has ? activity.id : null)}
            />

            <ScoreField value={editor.rating} onChange={editor.setRating} />

            <FranchiseField
              value={editor.franchiseId}
              onChange={editor.changeFranchise}
              franchises={franchises}
              disabled={busy}
              locked={activity.franchiseLocked}
            />

            <TagsField key={`tags:${activity.id}`} activity={activity} disabled={busy} />

            <AddToListField key={`lists:${activity.id}`} activity={activity} disabled={busy} />

            <FavouriteField value={editor.favorite} onToggle={() => editor.setFavorite((f) => !f)} />

            <NotesField activity={activity} value={editor.notes} onChange={editor.setNotes} />

            <MentionedInField activity={activity} />

            <MoreByField activity={activity} />

            <ActivityExtras key={`extras:${activity.id}`} activity={activity} disabled={busy} onClose={onClose} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="destructive"
            onClick={editor.remove}
            disabled={busy}
          >
            {editor.removing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Remove
          </Button>
          <Button type="button" onClick={() => editor.save()} disabled={busy}>
            {editor.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
