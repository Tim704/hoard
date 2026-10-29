'use client';

// ───────────────────────────────────────────────────────────────────────────
//  The short title popup ("Popup" title view): the poster, title and a meta
//  line; Status, Rating, Favorite, Progress and Notes; the new-season and
//  Last.fm notices. Remove · Open full page · Save. Everything else (seasons,
//  history, tags, lists, franchise, review, sessions, More by) is on the full
//  page, which "Open full page" opens with any unsaved edits carried over.
// ───────────────────────────────────────────────────────────────────────────

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ImageOff, Loader2, Maximize2, Trash2 } from 'lucide-react';

import { useDisplayTitle } from '@/components/prefs-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFocusReturn } from '@/hooks/use-focus-return';
import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';
import { showsListenBadge } from '@/lib/lastfm-suggest';
import { mediaSubtitle } from '@/lib/media-meta';
import { titleHref } from '@/lib/title-href';
import type { ActivityWithMedia } from '@/lib/types';

import {
  FavouriteField,
  ListenSuggestion,
  NewSeasonNotice,
  NotesField,
  ScoreField,
  StatusField,
  TitleProgressField,
} from './title-fields';
import { useHasSeasons } from './use-has-seasons';
import { useTitleEditor } from './use-title-editor';

/** Controlled: open while `activity` is non-null. */
export function TitlePopup({ activity, onClose }: { activity: ActivityWithMedia | null; onClose: () => void }) {
  const router = useRouter();
  const titleOf = useDisplayTitle();
  const editor = useTitleEditor(activity, {
    onSaved: onClose,
    onRemoved: () => {
      router.refresh();
      onClose();
    },
  });
  const seasonTracked = useHasSeasons(activity?.category === 'tv' ? activity.id : null);
  // The popup has no trigger (a card, a list row's title or a link opens
  // it), so closing it would leave focus on <body>: note what had focus as
  // it opens (before paint, so before the dialog takes focus) and focus
  // that again on close.
  const { remember, restore } = useFocusReturn();
  const openId = activity?.id ?? null;
  useIsomorphicLayoutEffect(() => {
    if (openId) remember();
  }, [openId, remember]);

  if (!activity) {
    // Render a closed, controlled dialog so transitions stay mounted.
    return <Dialog open={false} onOpenChange={(o) => !o && onClose()} />;
  }

  const { media } = activity;
  const title = titleOf(media);
  const meta = [media.year != null ? String(media.year) : null, mediaSubtitle(media, activity.category)]
    .filter(Boolean)
    .join(' · ');
  const { busy } = editor;
  const href = titleHref(activity.category, activity.id, 'page');

  function openFullPage() {
    editor.handOff();
    onClose();
    router.push(href);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* Phones: a sheet docked to the bottom edge; sm+: a centred dialog.
          The fields scroll inside while the footer stays put. */}
      <DialogContent
        onCloseAutoFocus={restore}
        className="bottom-0 top-auto flex max-h-[92dvh] max-w-full translate-y-0 flex-col overflow-hidden rounded-t-2xl border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-auto sm:top-[50%] sm:max-h-[90dvh] sm:max-w-lg sm:translate-y-[-50%] sm:border-b sm:p-6">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 pr-6 text-left">
          <div className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded bg-muted sm:w-14">
            {media.imageUrl ? (
              <Image src={media.imageUrl} alt="" fill sizes="56px" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageOff className="h-5 w-5" aria-hidden />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <DialogTitle className="break-words leading-snug">{title}</DialogTitle>
            {meta ? (
              <DialogDescription className="truncate">{meta}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">Status, rating, favorite, progress and notes</DialogDescription>
            )}
          </div>
        </DialogHeader>

        <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-1">
          {showsListenBadge(activity) && <ListenSuggestion activityId={activity.id} onDone={() => router.refresh()} />}
          {activity.newSeason != null && (
            <NewSeasonNotice key={`new-season:${activity.id}`} activityId={activity.id} season={activity.newSeason} />
          )}

          <StatusField value={editor.status} onChange={editor.setStatus} category={activity.category} />
          <ScoreField value={editor.rating} onChange={editor.setRating} />
          <FavouriteField value={editor.favorite} onToggle={() => editor.setFavorite(!editor.favorite)} />
          <TitleProgressField
            activity={activity}
            disabled={busy}
            seasonTracked={seasonTracked}
            onMarkFinished={() => {
              editor.setStatus('COMPLETED');
              void editor.save('COMPLETED');
            }}
          />
          <NotesField activity={activity} value={editor.notes} onChange={editor.setNotes} />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button type="button" variant="destructive" onClick={() => void editor.remove()} disabled={busy}>
            {editor.removing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" aria-hidden />}
            Remove
          </Button>
          <span className="flex-1" />
          <Button type="button" variant="outline" onClick={openFullPage} disabled={busy} className="whitespace-nowrap">
            <Maximize2 className="mr-2 hidden h-4 w-4 sm:inline" aria-hidden />
            Open full page
          </Button>
          <Button type="button" onClick={() => void editor.save()} disabled={busy}>
            {editor.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
