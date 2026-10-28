'use client';

import { useId, type ReactNode } from 'react';
import Image from 'next/image';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical, ImageOff, Layers, Star, X } from 'lucide-react';

import { useScoreFormat } from '@/components/prefs-provider';
import { cn } from '@/lib/utils';

/** One row in a rank list — generic so titles and franchises can share it. */
export interface RankRow {
  id: string;
  title: string;
  imageUrl: string | null;
  subtitle?: string | null;
  rating?: number | null;
  /** A small hint chip under the title (e.g. "Next in Haikyuu: Season 1"). */
  chip?: string | null;
  /** Extra inline content under the title (countdowns, streaming badges). */
  extra?: ReactNode;
}

interface SortableRankListProps {
  items: RankRow[];
  /** Called with the full reordered list after a drag or an up/down move. */
  onReorder: (next: RankRow[]) => void;
  /** Optional: remove an item from the ranking (back to the unranked tray). */
  onRemove?: (id: string) => void;
  disabled?: boolean;
  /** Optional: extra per-row controls (and content, shown under the row). */
  renderActions?: (row: RankRow) => ReactNode;
}

/**
 * A vertical, drag-and-drop ranked list (best first). Drag by the grip handle
 * with mouse, touch or keyboard (Space to pick up, arrows to move); the up/down
 * buttons are a precise fallback, especially on phones.
 */
export function SortableRankList({ items, onReorder, onRemove, disabled, renderActions }: SortableRankListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // A stable id: dnd-kit's own counter differs between server and client (hydration warning).
  const dndId = useId();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  };

  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= items.length) return;
    onReorder(arrayMove(items, index, to));
  };

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-2">
          {items.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              rank={index + 1}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              disabled={disabled}
              onUp={() => move(index, -1)}
              onDown={() => move(index, 1)}
              onRemove={onRemove ? () => onRemove(item.id) : undefined}
              actions={renderActions?.(item)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

interface SortableRowProps {
  item: RankRow;
  rank: number;
  isFirst: boolean;
  isLast: boolean;
  disabled?: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove?: () => void;
  actions?: ReactNode;
}

function SortableRow({ item, rank, isFirst, isLast, disabled, onUp, onDown, onRemove, actions }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled });
  const { scorePlain } = useScoreFormat();

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-2 pr-3',
        isDragging && 'relative z-10 border-primary/60 shadow-xl shadow-black/40',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag ${item.title}`}
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span
        className={cn(
          'w-7 shrink-0 text-center text-base font-bold tabular-nums',
          rank <= 3 ? 'text-amber-500 dark:text-amber-300' : 'text-muted-foreground',
        )}
      >
        {rank}
      </span>

      <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-muted ring-1 ring-border">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.title} fill sizes="44px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium leading-snug">{item.title}</p>
        {item.subtitle && <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>}
        {item.chip && (
          <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            <Layers className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{item.chip}</span>
          </p>
        )}
        {item.extra && <div className="mt-1 flex flex-wrap items-center gap-1.5">{item.extra}</div>}
      </div>

      {item.rating != null && (
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-300">
          <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
          {scorePlain(item.rating)}
        </span>
      )}

      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          onClick={onUp}
          disabled={disabled || isFirst}
          aria-label={`Move ${item.title} up`}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDown}
          disabled={disabled || isLast}
          aria-label={`Move ${item.title} down`}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {actions}

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${item.title} from ranking`}
          title="Remove from ranking"
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-rose-500 disabled:opacity-25"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}
