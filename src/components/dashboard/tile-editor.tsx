'use client';

// ───────────────────────────────────────────────────────────────────────────
//  The dashboard tile editor: which tiles show and in what order. One row per
//  tile with a Show checkbox, a drag handle (pointer, touch or keyboard) and
//  Move up / Move down. Recommend across media is the header's button: pinned
//  first, with the checkbox only. The tiles of sections hidden in Settings
//  aren't listed, and keep their stored places (moveTile, placeListed).
//
//  Changes stay here until Save (the dashboard is server-rendered), which
//  saves, toasts "Dashboard updated." with Undo and refreshes the page. Used
//  in the dashboard's Customize dialog (customize-dashboard.tsx) and inline in
//  Settings → Themes.
// ───────────────────────────────────────────────────────────────────────────

import { useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical, Pin } from 'lucide-react';

import { usePrefs } from '@/components/prefs-provider';
import { toastUndoable } from '@/components/undo-toast';
import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';
import { Button } from '@/components/ui/button';
import { updatePrefs } from '@/lib/actions/prefs';
import { settle } from '@/lib/action-result';
import { TILE_IDS, type TileId } from '@/lib/dashboard-tile-ids';
import {
  TILE_LABELS,
  isHiddenSectionTile,
  knownTileIds,
  moveTile,
  normalizeOrder,
  pinRecommend,
  placeListed,
  type DashboardTilesPref,
} from '@/lib/dashboard-tiles';
import type { ActionResult } from '@/lib/types';
import { cn } from '@/lib/utils';

type Direction = 'up' | 'down';
type Router = ReturnType<typeof useRouter>;
type DashboardPatch = { order: TileId[]; hidden: TileId[] };

/** What the editor starts from: every tile in the saved order (Recommend first) and the hidden ones. */
function editorState(saved: DashboardTilesPref): DashboardPatch {
  return { order: pinRecommend(normalizeOrder(saved.order)), hidden: knownTileIds(saved.hidden) };
}

const saveDashboard = (dashboard: DashboardPatch): Promise<ActionResult> => settle(updatePrefs({ dashboard }));

/** Undo: puts the value from before the save back. */
async function restore(previous: DashboardPatch, router: Router) {
  const res = await saveDashboard(previous);
  if (res.ok) {
    toast.success('Undone.');
    router.refresh();
  } else {
    toast.error(res.error ?? 'Could not undo that.');
  }
}

/** The rows' controls: 36px, the smallest touch target here. */
const CONTROL = 'h-9 w-9 shrink-0';

export function TileEditor({
  saved,
  onClose,
  onDragging,
  className,
}: {
  /** `prefs.dashboard` as stored. */
  saved: DashboardTilesPref;
  /** In a dialog: closes it (Cancel, and after a save). Inline, Cancel puts the saved value back. */
  onClose?: () => void;
  /** A drag starts or ends (the dialog keeps Escape for cancelling the drag). */
  onDragging?: (dragging: boolean) => void;
  className?: string;
}) {
  const router = useRouter();
  const { hiddenSections } = usePrefs();
  const initial = useMemo(() => editorState(saved), [saved]);
  const [order, setOrder] = useState(initial.order);
  const [hidden, setHidden] = useState<ReadonlySet<TileId>>(() => new Set(initial.hidden));
  const [saving, setSaving] = useState(false);

  const isListed = (id: TileId) => id !== 'recommend' && !isHiddenSectionTile(id, hiddenSections);
  const listed = order.filter(isListed);
  const dirty =
    order.some((id, i) => id !== initial.order[i]) ||
    hidden.size !== initial.hidden.length ||
    initial.hidden.some((id) => !hidden.has(id));

  async function save(next: DashboardPatch, message: string) {
    // Undo writes back what was stored, minus anything a save can't take.
    const previous = { order: knownTileIds(saved.order), hidden: knownTileIds(saved.hidden) };
    setSaving(true);
    const res = await saveDashboard(next);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? 'Could not save the dashboard.');
      return;
    }
    toastUndoable(message, () => void restore(previous, router), 'dashboard-tiles');
    onClose?.();
    router.refresh();
  }

  function onSave() {
    void save({ order: normalizeOrder(order), hidden: TILE_IDS.filter((id) => hidden.has(id)) }, 'Dashboard updated.');
  }

  function onReset() {
    setOrder([...TILE_IDS]);
    setHidden(new Set());
    void save({ order: [], hidden: [] }, 'Dashboard reset to default.');
  }

  function onCancel() {
    if (onClose) {
      onClose();
      return;
    }
    setOrder(initial.order);
    setHidden(new Set(initial.hidden));
  }

  function show(id: TileId, shown: boolean) {
    setHidden((h) => {
      const next = new Set(h);
      if (shown) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Move up / down keep focus on the moved row's button (its other one at an end).
  const listRef = useRef<HTMLUListElement>(null);
  const refocus = useRef<{ id: TileId; direction: Direction } | null>(null);
  function move(id: TileId, direction: Direction) {
    refocus.current = { id, direction };
    setOrder((o) => moveTile(o, id, direction, o.filter(isListed)));
  }
  useIsomorphicLayoutEffect(() => {
    const want = refocus.current;
    if (!want) return;
    refocus.current = null;
    const button = (direction: Direction) =>
      listRef.current?.querySelector<HTMLButtonElement>(`[data-move="${want.id}:${direction}"]`);
    const same = button(want.direction);
    (same && !same.disabled ? same : button(want.direction === 'up' ? 'down' : 'up'))?.focus();
  }, [order]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // A stable id: dnd-kit's own counter differs between server and client (hydration warning).
  const dndId = useId();

  function onDragEnd({ active, over }: DragEndEvent) {
    onDragging?.(false);
    if (!over || active.id === over.id) return;
    setOrder((o) => {
      const rows = o.filter(isListed);
      const from = rows.indexOf(active.id as TileId);
      const to = rows.indexOf(over.id as TileId);
      return from < 0 || to < 0 ? o : placeListed(o, arrayMove(rows, from, to));
    });
  }

  const name = (id: UniqueIdentifier) => TILE_LABELS[id as TileId] ?? String(id);
  const place = (id: UniqueIdentifier) => `position ${listed.indexOf(id as TileId) + 1} of ${listed.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}, ${place(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${name(active.id)} moved to ${place(over.id)}.` : `${name(active.id)} is outside the list.`),
    onDragEnd: ({ active, over }) =>
      over ? `${name(active.id)} dropped at ${place(over.id)}. Save to keep it.` : `${name(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`,
  };

  return (
    <div className={cn('flex min-h-0 flex-col gap-4', className)}>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => onDragging?.(true)}
        onDragEnd={onDragEnd}
        onDragCancel={() => onDragging?.(false)}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'To move a tile, press Space or Enter, then the up and down arrow keys. Press Space or Enter again to drop it, or Escape to cancel.',
          },
        }}
      >
        <SortableContext items={listed} strategy={verticalListSortingStrategy}>
          <ul ref={listRef} aria-label="Dashboard tiles" className="-m-0.5 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-0.5">
            <li className={ROW}>
              <span className={cn(CONTROL, 'flex items-center justify-center text-muted-foreground')}>
                <Pin className="h-4 w-4" aria-hidden />
              </span>
              <ShowToggle
                label={TILE_LABELS.recommend}
                note="The header’s button, always first"
                shown={!hidden.has('recommend')}
                onShow={(v) => show('recommend', v)}
                disabled={saving}
              />
            </li>
            {listed.map((id, i) => (
              <TileRow
                key={id}
                id={id}
                shown={!hidden.has(id)}
                onShow={(v) => show(id, v)}
                first={i === 0}
                last={i === listed.length - 1}
                onMove={(direction) => move(id, direction)}
                disabled={saving}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="flex shrink-0 flex-nowrap items-center gap-2">
        <Button type="button" variant="ghost" className="mr-auto px-3" onClick={onReset} disabled={saving}>
          Reset to default
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving || (!onClose && !dirty)}>
          Cancel
        </Button>
        <Button type="button" onClick={onSave} disabled={saving || !dirty}>
          Save
        </Button>
      </div>
    </div>
  );
}

const ROW = 'flex min-w-0 items-center gap-1 rounded-lg border border-border bg-card p-1';

function TileRow({
  id,
  shown,
  onShow,
  first,
  last,
  onMove,
  disabled,
}: {
  id: TileId;
  shown: boolean;
  onShow: (shown: boolean) => void;
  first: boolean;
  last: boolean;
  onMove: (direction: Direction) => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const label = TILE_LABELS[id];

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(ROW, isDragging && 'relative z-10 border-primary/60 shadow-lg')}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag ${label}`}
        className={cn(
          CONTROL,
          'flex cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing',
        )}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <ShowToggle label={label} shown={shown} onShow={onShow} disabled={disabled} />
      {(['up', 'down'] as const).map((direction) => (
        <Button
          key={direction}
          type="button"
          variant="ghost"
          size="icon"
          data-move={`${id}:${direction}`}
          aria-label={`Move ${label} ${direction}`}
          disabled={disabled || (direction === 'up' ? first : last)}
          onClick={() => onMove(direction)}
          className={CONTROL}
        >
          {direction === 'up' ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        </Button>
      ))}
    </li>
  );
}

/** A tile's Show checkbox with its name (truncating), the row's flexible part. */
function ShowToggle({
  label,
  note,
  shown,
  onShow,
  disabled,
}: {
  label: string;
  note?: string;
  shown: boolean;
  onShow: (shown: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-3 px-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 accent-primary"
        checked={shown}
        onChange={(e) => onShow(e.target.checked)}
        disabled={disabled}
        aria-label={`Show ${label}`}
      />
      <span className="min-w-0">
        <span className={cn('block truncate font-medium', !shown && 'text-muted-foreground')}>{label}</span>
        {note && <span className="block truncate text-xs text-muted-foreground">{note}</span>}
      </span>
    </label>
  );
}
