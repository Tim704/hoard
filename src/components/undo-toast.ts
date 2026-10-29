'use client';

// Toasts with an Undo button (spec 1.6): shown for 8 s after a remove, a
// status change or a display switch (layout, title view). The remove carries
// only a server-side token; a status change carries the previous state the
// server reported; a display switch undoes itself on the client.

import { toast } from 'sonner';

import { restoreActivity, restoreActivityState } from '@/lib/actions/media';
import type { ActivityState } from '@/lib/undo';

const UNDO_MS = 8000;

/** "Removed Dune." · Undo — restores the activity and its history. */
export function toastRemoved(title: string, undoToken: string | undefined, onUndone: () => void) {
  const message = `Removed “${title}”.`;
  if (!undoToken) {
    toast.success(message);
    return;
  }
  toast.success(message, {
    duration: UNDO_MS,
    action: {
      label: 'Undo',
      onClick: async () => {
        const res = await restoreActivity(undoToken);
        if (res.ok) {
          toast.success(`“${title}” is back.`);
          onUndone();
        } else {
          toast.error(res.error ?? 'Could not undo that.');
        }
      },
    },
  });
}

/** "Marked Dune as Read." · Undo — puts the previous status (and score, queue spot…) back. */
export function toastStatusChange(
  message: string,
  activityId: string,
  previous: ActivityState | undefined,
  onUndone: () => void,
) {
  if (!previous) {
    toast.success(message);
    return;
  }
  toast.success(message, {
    duration: UNDO_MS,
    action: {
      label: 'Undo',
      onClick: async () => {
        const res = await restoreActivityState(activityId, previous);
        if (res.ok) {
          toast.success('Undone.');
          onUndone();
        } else {
          toast.error(res.error ?? 'Could not undo that.');
        }
      },
    },
  });
}

/**
 * "Layout: Fresh" · Undo — `undo` puts the previous value back (and reports
 * itself). A toast with the same `id` replaces this one.
 */
export function toastUndoable(message: string, undo: () => void, id?: string) {
  toast.success(message, {
    id,
    duration: UNDO_MS,
    action: { label: 'Undo', onClick: undo },
  });
}
