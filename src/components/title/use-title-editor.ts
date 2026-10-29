'use client';

// The editable part of a title's details: status, rating, favourite, notes
// and franchise, saved together by Save; and Remove. Undo toasts as
// everywhere else (src/components/undo-toast.ts).
//
// The hook keeps what the fields show (`local`) and what the server is known
// to hold (`base`): `dirty` is their difference, and a newer server value
// (Undo, Watch again, "Mark as Listened", another tab) flows into every field
// that wasn't edited (src/lib/title-draft.ts). With `keepDrafts` (the title
// page) unsaved edits outlive the page for this tab (./title-drafts.ts).

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { useDisplayTitle } from '@/components/prefs-provider';
import { toastRemoved, toastStatusChange } from '@/components/undo-toast';
import { assignFranchise } from '@/lib/actions/franchise';
import { removeActivity, updateActivity } from '@/lib/actions/media';
import { statusLabel, type Status } from '@/lib/status';
import {
  EMPTY_VALUES,
  NEW_FRANCHISE,
  NO_FRANCHISE,
  applyDraft,
  changedFields,
  followServer,
  valuesKey,
  valuesOf,
  type TitleValues,
} from '@/lib/title-draft';
import type { ActivityWithMedia } from '@/lib/types';

import { clearTitleDraft, readTitleDraft, writeTitleDraft } from './title-drafts';

export { NEW_FRANCHISE, NO_FRANCHISE } from '@/lib/title-draft';

export interface TitleEditor extends TitleValues {
  setStatus: (s: Status) => void;
  setRating: (v: number | null) => void;
  setFavorite: (f: boolean) => void;
  setNotes: (v: string) => void;
  setFranchise: (id: string) => void;
  /** The fields edited since the last save (empty: nothing to save). */
  changed: (keyof TitleValues)[];
  dirty: boolean;
  saving: boolean;
  removing: boolean;
  /** Saving or removing: the fields are locked. */
  busy: boolean;
  /** `statusOverride`: "Mark as finished" saves with the finished status. */
  save: (statusOverride?: Status) => Promise<void>;
  remove: () => Promise<void>;
  /** Puts every field back to the saved value. */
  discard: () => void;
  /** Keeps the unsaved edits for the title page (the popup's "Open full page"). */
  handOff: () => void;
}

interface EditorState {
  id: string | null;
  /** valuesKey of the server values `base` last followed. */
  key: string;
  local: TitleValues;
  base: TitleValues;
}

export interface TitleEditorOptions {
  /** After a successful save (the popup closes). */
  onSaved?: () => void;
  /** After a successful remove; by default the page refreshes. */
  onRemoved?: () => void;
  /** Unsaved edits survive leaving (and are shown again) — the title page. */
  keepDrafts?: boolean;
}

/** State and actions for one title's details. `activity` may be null (a closed popup). */
export function useTitleEditor(activity: ActivityWithMedia | null, options: TitleEditorOptions = {}): TitleEditor {
  const { onSaved, onRemoved, keepDrafts = false } = options;
  const router = useRouter();
  const titleOf = useDisplayTitle();

  const id = activity?.id ?? null;
  const server = activity ? valuesOf(activity) : EMPTY_VALUES;
  const serverKey = valuesKey(server);

  const [state, setState] = useState<EditorState>(() => ({ id, key: serverKey, local: server, base: server }));
  // Adjusted while rendering (React's "state from a prop change"): a new
  // title starts from its saved values; new server values flow into the
  // fields that weren't edited.
  let current = state;
  if (state.id !== id) current = { id, key: serverKey, local: server, base: server };
  else if (state.key !== serverKey) current = { id, key: serverKey, ...followServer(state.local, state.base, server) };
  if (current !== state) setState(current);

  /** The newest state, for handlers that run before the next render. */
  const latest = useRef(current);
  latest.current = current;
  const commit = (next: EditorState) => {
    latest.current = next;
    setState(next);
  };
  const update = (patch: Partial<TitleValues>) => {
    const s = latest.current;
    commit({ ...s, local: { ...s.local, ...patch } });
  };

  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  // The title page: show edits left unsaved here earlier (after the first
  // paint, so the server render and hydration agree), then keep them in
  // step with the fields.
  const [draftsReady, setDraftsReady] = useState(false);
  useEffect(() => {
    if (!keepDrafts || !id) return;
    const draft = readTitleDraft(id);
    const s = latest.current;
    if (draft && s.id === id) commit({ ...s, local: applyDraft(s.local, draft) });
    setDraftsReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per title
  }, [keepDrafts, id]);

  const changed = changedFields(current.local, current.base);
  const dirty = changed.length > 0;
  const localKey = valuesKey(current.local);
  const baseKey = valuesKey(current.base);
  useEffect(() => {
    if (!keepDrafts || !draftsReady || !id) return;
    const s = latest.current;
    if (dirty) writeTitleDraft(id, { local: s.local, base: s.base });
    else clearTitleDraft(id);
  }, [keepDrafts, draftsReady, id, dirty, localKey, baseKey]);

  async function save(statusOverride?: Status) {
    if (!activity) return;
    const before = latest.current;
    const values: TitleValues = statusOverride ? { ...before.local, status: statusOverride } : before.local;
    setSaving(true);
    try {
      const res = await updateActivity(activity.id, {
        status: values.status,
        rating: values.rating,
        favorite: values.favorite,
        notes: values.notes,
      });
      if (!res.ok) {
        toast.error(res.error ?? 'Could not save changes.');
        return;
      }
      // A franchise picked by hand is locked, so automatic detection never undoes it.
      let saved = values;
      if (values.franchiseId !== before.base.franchiseId) {
        const target = values.franchiseId === NO_FRANCHISE ? null : values.franchiseId === NEW_FRANCHISE ? 'new' : values.franchiseId;
        const moved = await assignFranchise(activity.id, target).catch(() => ({ ok: false as const, error: undefined }));
        if (!moved.ok) {
          saved = { ...values, franchiseId: before.base.franchiseId };
          toast.error(moved.error ?? 'Could not change the franchise.');
        }
      }
      // The fields now match what was saved; anything typed meanwhile stays an edit.
      const now = latest.current;
      commit({ ...now, local: statusOverride ? { ...now.local, status: statusOverride } : now.local, base: saved });

      const refresh = () => router.refresh();
      if (values.status !== activity.status) {
        toastStatusChange(
          `Marked “${titleOf(activity.media)}” as ${statusLabel(values.status, activity.category)}.`,
          activity.id,
          res.previous,
          refresh,
        );
      } else {
        toast.success('Saved.');
      }
      refresh();
      onSaved?.();
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
        clearTitleDraft(activity.id);
        toastRemoved(titleOf(activity.media), res.undoToken, () => router.refresh());
        if (onRemoved) onRemoved();
        else router.refresh();
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
    ...current.local,
    setStatus: (status) => update({ status }),
    setRating: (rating) => update({ rating }),
    setFavorite: (favorite) => update({ favorite }),
    setNotes: (notes) => update({ notes }),
    setFranchise: (franchiseId) => update({ franchiseId }),
    changed,
    dirty,
    saving,
    removing,
    busy: saving || removing,
    save,
    remove,
    discard: () => commit({ ...latest.current, local: latest.current.base }),
    handOff: () => {
      const s = latest.current;
      if (s.id && changedFields(s.local, s.base).length) writeTitleDraft(s.id, { local: s.local, base: s.base });
    },
  };
}
