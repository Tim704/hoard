'use client';

// The editable part of a title's details: status, rating, favourite and notes
// (saved together by Save), the franchise (saved at once), and Remove. Undo
// toasts as everywhere else (src/components/undo-toast.ts).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { useDisplayTitle } from '@/components/prefs-provider';
import { toastRemoved, toastStatusChange } from '@/components/undo-toast';
import { assignFranchise } from '@/lib/actions/franchise';
import { removeActivity, updateActivity } from '@/lib/actions/media';
import { statusLabel, type Status } from '@/lib/status';
import type { ActivityWithMedia } from '@/lib/types';

/** The franchise picker's "no franchise" and "new franchise from this title" values. */
export const NO_FRANCHISE = '__none';
export const NEW_FRANCHISE = '__new';

export interface TitleEditor {
  status: Status;
  setStatus: (s: Status) => void;
  rating: number | null;
  setRating: (v: number | null) => void;
  favorite: boolean;
  setFavorite: (f: boolean | ((prev: boolean) => boolean)) => void;
  notes: string;
  setNotes: (v: string) => void;
  franchiseId: string;
  changeFranchise: (value: string) => Promise<void>;
  saving: boolean;
  removing: boolean;
  moving: boolean;
  /** Saving, removing or moving: the fields are locked. */
  busy: boolean;
  /** `statusOverride`: "Mark as finished" saves with the finished status. */
  save: (statusOverride?: Status) => Promise<void>;
  remove: () => Promise<void>;
}

/**
 * State and actions for one title's details. `activity` may be null (a
 * closed dialog). `onDone` runs after a successful save or remove.
 */
export function useTitleEditor(
  activity: ActivityWithMedia | null,
  { onDone }: { onDone: () => void },
): TitleEditor {
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

  // Re-sync local editable state whenever a different activity is selected.
  // Keyed on the id so a background refresh doesn't wipe unsaved edits.
  useEffect(() => {
    if (activity) {
      setStatus(activity.status);
      setRating(activity.rating);
      setFavorite(activity.favorite);
      setNotes(activity.notes ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.id]);

  // The franchise saves immediately, so always mirror the server's value.
  useEffect(() => {
    setFranchiseId(activity?.franchise?.id ?? NO_FRANCHISE);
  }, [activity?.id, activity?.franchise?.id]);

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
            `Marked “${titleOf(activity.media)}” as ${statusLabel(nextStatus, activity.category)}.`,
            activity.id,
            res.previous,
            refresh,
          );
        } else {
          toast.success('Saved.');
        }
        refresh();
        onDone();
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
        toastRemoved(titleOf(activity.media), res.undoToken, () => router.refresh());
        router.refresh();
        onDone();
      } else {
        toast.error(res.error ?? 'Could not remove that item.');
      }
    } catch {
      toast.error('Could not remove that item.');
    } finally {
      setRemoving(false);
    }
  }

  return {
    status,
    setStatus,
    rating,
    setRating,
    favorite,
    setFavorite,
    notes,
    setNotes,
    franchiseId,
    changeFranchise,
    saving,
    removing,
    moving,
    busy: saving || removing || moving,
    save,
    remove,
  };
}
