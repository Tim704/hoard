'use client';

import { useId, useState, type ReactNode } from 'react';
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
import {
  ArrowDownToLine,
  ArrowUpDown,
  ArrowUpToLine,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImageOff,
  Layers,
  MoreVertical,
  Star,
  Trash2,
  X,
} from 'lucide-react';

import { useScoreFormat } from '@/components/prefs-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  /** What Remove does here, as its label ("Remove from list"). */
  removeLabel?: string;
}

/**
 * A vertical, drag-and-drop ranked list (best first). From sm: drag by the grip
 * handle with mouse, touch or keyboard (Space to pick up, arrows to move), or
 * use the up/down buttons and ×. On phones the row gives the title two lines
 * and has one 44px ⋮ menu (Move to top / up / down / bottom, Remove), and
 * "Reorder" turns every row's menu into two 44px arrows side by side.
 */
export function SortableRankList({
  items,
  onReorder,
  onRemove,
  disabled,
  renderActions,
  removeLabel = 'Remove from ranking',
}: SortableRankListProps) {
  const [reordering, setReordering] = useState(false);
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

  const moveTo = (index: number, to: number) => {
    if (to < 0 || to >= items.length || to === index) return;
    onReorder(arrayMove(items, index, to));
  };
  const move = (index: number, delta: -1 | 1) => moveTo(index, index + delta);

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.length > 1 && (
          <div className="mb-2 flex justify-end sm:hidden">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={reordering}
              onClick={() => setReordering((r) => !r)}
            >
              {reordering ? <Check className="h-4 w-4" aria-hidden /> : <ArrowUpDown className="h-4 w-4" aria-hidden />}
              {reordering ? 'Done' : 'Reorder'}
            </Button>
          </div>
        )}
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
              onTop={() => moveTo(index, 0)}
              onBottom={() => moveTo(index, items.length - 1)}
              onRemove={onRemove ? () => onRemove(item.id) : undefined}
              removeLabel={removeLabel}
              reordering={reordering}
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
  onTop: () => void;
  onBottom: () => void;
  onRemove?: () => void;
  removeLabel: string;
  /** Phones: arrows instead of the ⋮ menu. */
  reordering: boolean;
  actions?: ReactNode;
}

function SortableRow({
  item,
  rank,
  isFirst,
  isLast,
  disabled,
  onUp,
  onDown,
  onTop,
  onBottom,
  onRemove,
  removeLabel,
  reordering,
  actions,
}: SortableRowProps) {
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
        className="hidden cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing sm:inline-flex"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span
        className={cn(
          'w-6 shrink-0 text-center text-base font-bold tabular-nums sm:w-7',
          rank <= 3 ? 'text-amber-500 dark:text-amber-300 minimal:text-rating organised:text-rating' : 'text-muted-foreground',
        )}
      >
        {rank}
      </span>

      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-muted ring-1 ring-border sm:h-16 sm:w-11">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.title} fill sizes="44px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words font-medium leading-snug sm:line-clamp-none sm:truncate">{item.title}</p>
        {item.subtitle && <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>}
        {item.chip && (
          <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <Layers className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{item.chip}</span>
          </p>
        )}
      </div>

      {item.rating != null && (
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-rating">
          <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
          {scorePlain(item.rating)}
        </span>
      )}

      {/* sm+: 28px targets (over WCAG's 24px minimum), stacked inside the 64px poster's height. */}
      <div className="hidden shrink-0 flex-col sm:flex">
        <button
          type="button"
          onClick={onUp}
          disabled={disabled || isFirst}
          aria-label={`Move ${item.title} up`}
          className="rounded p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-25"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDown}
          disabled={disabled || isLast}
          aria-label={`Move ${item.title} down`}
          className="rounded p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-25"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {/* Phones: one ⋮ menu, or (Reorder) two arrows side by side, never stacked. */}
      <div className="flex shrink-0 gap-1 sm:hidden">
        {reordering ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11"
              onClick={onUp}
              disabled={disabled || isFirst}
              aria-label={`Move ${item.title} up`}
            >
              <ChevronUp className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11"
              onClick={onDown}
              disabled={disabled || isLast}
              aria-label={`Move ${item.title} down`}
            >
              <ChevronDown className="h-5 w-5" />
            </Button>
          </>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-muted-foreground"
                disabled={disabled}
                aria-label={`Actions for ${item.title}`}
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem className="min-h-11" disabled={isFirst} onSelect={onTop}>
                <ArrowUpToLine aria-hidden /> Move to top
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" disabled={isFirst} onSelect={onUp}>
                <ChevronUp aria-hidden /> Move up
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" disabled={isLast} onSelect={onDown}>
                <ChevronDown aria-hidden /> Move down
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" disabled={isLast} onSelect={onBottom}>
                <ArrowDownToLine aria-hidden /> Move to bottom
              </DropdownMenuItem>
              {onRemove && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="min-h-11 text-destructive focus:text-destructive" onSelect={onRemove}>
                    <Trash2 aria-hidden /> {removeLabel}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Phones: the row's own actions (Up next's "Read") go on their own line under the text. */}
      {actions && <div className="order-last basis-full pl-[5.5rem] sm:contents">{actions}</div>}

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`${removeLabel}: ${item.title}`}
          title={removeLabel}
          className="hidden shrink-0 rounded p-1 text-muted-foreground hover:text-rose-500 disabled:opacity-25 sm:inline-flex"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}
