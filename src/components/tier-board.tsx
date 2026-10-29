'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical, ImageOff, Sparkles, Star, Wand2 } from 'lucide-react';

import { ScoreThese } from '@/components/score-these';
import { Button } from '@/components/ui/button';
import { acceptSuggestedTiers, saveTiers } from '@/lib/actions/ranking';
import type { CategorySlug } from '@/lib/categories';
import { mediaSubtitle } from '@/lib/media-meta';
import { useDisplayTitle, useScoreFormat } from '@/components/prefs-provider';
import {
  boardPlacement,
  findContainer,
  moveItem,
  resolveDrop,
  suggestTier,
  TIERS,
  type RankableItem,
  type Tier,
  type TierBoardData,
  type TierContainer,
  type TierPlacement,
} from '@/lib/tiers';
import type { ActionResult, ActivityWithMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TierBoardProps {
  slug: CategorySlug;
  initial: TierBoardData;
  /** Finished (or well-played) titles with no score yet (`unscoredFinished`), for "Score these". */
  unscored: ActivityWithMedia[];
}

/** What a board row shows for an item. */
export interface BoardItemView {
  title: string;
  subtitle: string;
  imageUrl: string | null;
}

/** The board for any item type (activities, TV seasons, …). */
export interface ItemTierBoardProps<T extends RankableItem> {
  initial: TierBoardData<T>;
  save: (placement: TierPlacement, trayIds: string[]) => Promise<ActionResult>;
  acceptAll: () => Promise<ActionResult>;
  view: (item: T) => BoardItemView;
  /** Shown when nothing is on the board. */
  emptyText: string;
  /** "Score these · n" button next to the tray heading (activities only). */
  scoreThese?: { count: number; onOpen: () => void } | null;
}

/** Accent per tier: label cell and suggestion chip (readable in light and dark). */
const TIER_STYLE: Record<Tier, string> = {
  S: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40',
  A: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40',
  B: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40',
  C: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
  D: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40',
  F: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/40',
};

const samePlacement = <T extends RankableItem>(a: TierBoardData<T>, b: TierBoardData<T>) =>
  JSON.stringify(boardPlacement(a)) === JSON.stringify(boardPlacement(b));

/**
 * A section's tier list: its finished titles on the generic board, saved
 * through `saveTiers`. The tray's "Score these" button opens the scoring
 * dialog in place (its only entry point).
 */
export function TierBoard({ slug, initial, unscored }: TierBoardProps) {
  const titleOf = useDisplayTitle();
  const [scoring, setScoring] = useState(false);
  return (
    <>
      <ItemTierBoard<ActivityWithMedia>
        initial={initial}
        save={(placement, trayIds) => saveTiers(slug, placement, trayIds)}
        acceptAll={() => acceptSuggestedTiers(slug)}
        view={(a) => ({
          title: titleOf(a.media),
          subtitle: [a.media.year, mediaSubtitle(a.media, a.category)].filter(Boolean).join(' · '),
          imageUrl: a.media.imageUrl,
        })}
        emptyText="Nothing to tier yet — finish something first."
        scoreThese={unscored.length > 0 ? { count: unscored.length, onOpen: () => setScoring(true) } : null}
      />
      <ScoreThese slug={slug} items={unscored} open={scoring} onOpenChange={setScoring} />
    </>
  );
}

/**
 * The tier list editor: six hand-placed tiers (S…F) plus the Unranked tray.
 * Drag between and within tiers, or use each row's arrows and tier picker.
 * Every change saves immediately (optimistically) through `save`.
 */
export function ItemTierBoard<T extends RankableItem>({
  initial,
  save,
  acceptAll: accept,
  view,
  emptyText,
  scoreThese,
}: ItemTierBoardProps<T>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [board, setBoard] = useState<TierBoardData<T>>(initial);
  // The board as it was when the current drag started (for cancel / persist).
  const dragStart = useRef<TierBoardData<T> | null>(null);

  // Resync when the server sends fresh data (after accepting or a refresh).
  useEffect(() => setBoard(initial), [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // A stable id: dnd-kit's own counter differs between server and client (hydration warning).
  const dndId = useId();

  function persist(next: TierBoardData<T>, prev: TierBoardData<T>) {
    setBoard(next);
    if (samePlacement(next, prev)) return; // tray-only shuffles are not stored
    startTransition(async () => {
      const res = await save(
        boardPlacement(next),
        next.tray.map((a) => a.id),
      );
      if (!res.ok) {
        setBoard(prev);
        toast.error(res.error ?? 'Could not save the tier list.');
        router.refresh();
      }
    });
  }

  const move = (id: string, to: TierContainer, index?: number) =>
    persist(moveItem(board, id, to, index), board);

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    // Cross-container moves happen live so the item previews in its new tier.
    setBoard((b) => {
      const from = findContainer(b, String(active.id));
      const drop = resolveDrop(b, String(over.id));
      if (!from || !drop || drop.container === from) return b;
      return moveItem(b, String(active.id), drop.container, drop.index);
    });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const start = dragStart.current ?? board;
    dragStart.current = null;
    if (!over) {
      setBoard(start);
      return;
    }
    let next = board;
    const from = findContainer(board, String(active.id));
    const drop = resolveDrop(board, String(over.id));
    if (drop && drop.container === from && over.id !== active.id) {
      next = moveItem(board, String(active.id), drop.container, drop.index);
    }
    persist(next, start);
  }

  function handleDragCancel() {
    if (dragStart.current) setBoard(dragStart.current);
    dragStart.current = null;
  }

  const acceptAll = () =>
    startTransition(async () => {
      const res = await accept();
      if (res.ok) {
        toast.success('Placed everything in its suggested tier. Drag to fine-tune.');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not accept the suggestions.');
      }
    });

  const placedCount = TIERS.reduce((n, t) => n + board.tiers[t].length, 0);
  if (placedCount === 0 && board.tray.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  const hasSuggestions = board.tray.some((a) => suggestTier(a.rating) !== null);
  const rowProps = { disabled: isPending, onMove: move, view };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={() => {
        dragStart.current = board;
      }}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="space-y-8">
        <section className="space-y-2">
          {TIERS.map((tier) => (
            <TierRow key={tier} tier={tier} items={board.tiers[tier]} {...rowProps} />
          ))}
          <p className="text-xs text-muted-foreground">
            Drag by the handle, or use the arrows and tier picker. Changes save automatically.
          </p>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="tray-heading" className="text-base font-semibold text-muted-foreground">
              Unranked · {board.tray.length}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {scoreThese && (
                <button
                  type="button"
                  onClick={scoreThese.onOpen}
                  aria-haspopup="dialog"
                  className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-amber-700 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-300"
                >
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Score these · {scoreThese.count}
                </button>
              )}
              {hasSuggestions && (
                <Button variant="outline" size="sm" onClick={acceptAll} disabled={isPending}>
                  <Wand2 className="mr-2 h-4 w-4" aria-hidden />
                  Accept all suggestions
                </Button>
              )}
            </div>
          </div>
          <Container id="tray" items={board.tray} labelledBy="tray-heading" {...rowProps}>
            {board.tray.length === 0 && (
              <li className="py-3 text-center text-sm text-muted-foreground">
                Everything is placed. Drop one here to unrank it.
              </li>
            )}
          </Container>
        </section>
      </div>
    </DndContext>
  );
}

interface RowActions<T extends RankableItem> {
  disabled: boolean;
  onMove: (id: string, to: TierContainer, index?: number) => void;
  view: (item: T) => BoardItemView;
}

function TierRow<T extends RankableItem>({
  tier,
  items,
  ...actions
}: { tier: Tier; items: T[] } & RowActions<T>) {
  const labelId = `tier-${tier}-label`;
  return (
    <div className="flex overflow-hidden rounded-lg border border-border bg-card">
      <div
        className={cn(
          'flex w-12 shrink-0 flex-col items-center justify-center border-r sm:w-16',
          TIER_STYLE[tier],
        )}
      >
        <span id={labelId} className="text-2xl font-black sm:text-3xl">
          <span className="sr-only">Tier </span>
          {tier}
        </span>
        <span className="text-xs tabular-nums opacity-80" aria-hidden>
          {items.length}
        </span>
      </div>
      <Container id={tier} items={items} labelledBy={labelId} {...actions} className="p-2" />
    </div>
  );
}

interface ContainerProps<T extends RankableItem> extends RowActions<T> {
  id: TierContainer;
  items: T[];
  labelledBy: string;
  className?: string;
  children?: React.ReactNode;
}

/** A droppable, sortable list: one tier or the tray (accepts drops when empty). */
function Container<T extends RankableItem>({
  id,
  items,
  labelledBy,
  className,
  children,
  ...actions
}: ContainerProps<T>) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <SortableContext id={id} items={items.map((a) => a.id)} strategy={verticalListSortingStrategy}>
      <ol
        ref={setNodeRef}
        aria-labelledby={labelledBy}
        className={cn(
          'flex min-h-[4.5rem] min-w-0 flex-1 flex-col gap-2 rounded-md transition-colors',
          id === 'tray' && 'rounded-lg border border-dashed border-border p-2',
          isOver && 'bg-muted/60',
          className,
        )}
      >
        {items.map((a, index) => (
          <BoardItem
            key={a.id}
            item={a}
            container={id}
            index={index}
            isLast={index === items.length - 1}
            {...actions}
          />
        ))}
        {children}
      </ol>
    </SortableContext>
  );
}

interface BoardItemProps<T extends RankableItem> extends RowActions<T> {
  item: T;
  container: TierContainer;
  index: number;
  isLast: boolean;
}

const controlClass =
  'flex h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-25 sm:h-8 sm:min-w-8';

function BoardItem<T extends RankableItem>({
  item: a,
  container,
  index,
  isLast,
  disabled,
  onMove,
  view,
}: BoardItemProps<T>) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: a.id, disabled });
  const { title, subtitle, imageUrl } = view(a);
  const suggestion = container === 'tray' ? suggestTier(a.rating) : null;
  const { scorePlain } = useScoreFormat();

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-background p-1.5 pr-2',
        isDragging && 'relative z-10 border-primary/60 shadow-xl shadow-black/40',
      )}
    >
      <div className="flex min-w-0 flex-1 basis-48 items-center gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag ${title}`}
          className={cn(controlClass, 'shrink-0 cursor-grab touch-none active:cursor-grabbing')}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>

        <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-muted ring-1 ring-border">
          {imageUrl ? (
            <Image src={imageUrl} alt="" fill sizes="40px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-snug">{title}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {a.rating != null && (
              <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-amber-600 dark:text-amber-300">
                <Star className="h-3 w-3 fill-current" aria-hidden />
                {scorePlain(a.rating)}
              </span>
            )}
            {subtitle && <span className="truncate">{subtitle}</span>}
          </p>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {suggestion && (
          <button
            type="button"
            onClick={() => onMove(a.id, suggestion)}
            disabled={disabled}
            aria-label={`Place ${title} in suggested tier ${suggestion}`}
            title={`Place in tier ${suggestion}`}
            className={cn(
              'flex h-11 min-w-11 items-center justify-center rounded-full border px-2 text-sm font-bold disabled:opacity-50 sm:h-8 sm:min-w-8',
              TIER_STYLE[suggestion],
            )}
          >
            {suggestion}?
          </button>
        )}

        {container !== 'tray' && (
          <>
            <button
              type="button"
              onClick={() => onMove(a.id, container, index - 1)}
              disabled={disabled || index === 0}
              aria-label={`Move ${title} up`}
              className={controlClass}
            >
              <ChevronUp className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onMove(a.id, container, index + 1)}
              disabled={disabled || isLast}
              aria-label={`Move ${title} down`}
              className={controlClass}
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}

        <select
          value={container}
          onChange={(e) => onMove(a.id, e.target.value as TierContainer)}
          disabled={disabled}
          aria-label={`Tier for ${title}`}
          className="h-11 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50 sm:h-8"
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value="tray">Unranked</option>
        </select>
      </div>
    </li>
  );
}
