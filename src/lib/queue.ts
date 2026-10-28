import { isReleased, isYmd } from '@/lib/release';
import type { ActivityWithMedia } from '@/lib/types';

/** Gap between queue positions, so rewrites are always clean multiples. */
export const QUEUE_STEP = 1000;

/**
 * The Up next queue: PLANNED items only. Legacy rows with no position yet
 * (null — everything PLANNED before the queue existed) come first, oldest
 * first; then positioned rows by `queueOrder` ascending. New items get
 * max + 1000, so they always land at the bottom. Equal keys fall back to
 * createdAt, then id, so the order is deterministic.
 */
export function orderQueue<
  T extends Pick<ActivityWithMedia, 'id' | 'status' | 'queueOrder' | 'createdAt'>,
>(all: T[]): T[] {
  return all
    .filter((a) => a.status === 'PLANNED')
    .sort((a, b) => {
      if (a.queueOrder === null && b.queueOrder !== null) return -1;
      if (a.queueOrder !== null && b.queueOrder === null) return 1;
      if (a.queueOrder !== null && b.queueOrder !== null && a.queueOrder !== b.queueOrder) {
        return a.queueOrder - b.queueOrder;
      }
      return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    });
}

/** Position for an item joining the end of the queue. */
export function nextQueueOrder(maxQueueOrder: number | null): number {
  return maxQueueOrder === null ? QUEUE_STEP : maxQueueOrder + QUEUE_STEP;
}

/**
 * Up next's view split (5.4): titles that are out (per F2's rule, see
 * isReleased) keep their queue order; the rest go under "Not out yet",
 * soonest first (a full date before a year-only title of the same year,
 * then queue order). The queue itself is not changed.
 */
export function splitQueue<T extends { media: { releaseDate?: unknown; year?: unknown } }>(
  queue: T[],
  today: string,
): { available: T[]; notYet: T[] } {
  const available: T[] = [];
  const notYet: T[] = [];
  for (const a of queue) (isReleased(a.media, today) ? available : notYet).push(a);
  const key = (a: T) =>
    isYmd(a.media.releaseDate) ? a.media.releaseDate : `${String(a.media.year ?? '9999').padStart(4, '0')}-99`;
  const pos = new Map(queue.map((a, i) => [a, i]));
  notYet.sort((a, b) => key(a).localeCompare(key(b)) || pos.get(a)! - pos.get(b)!);
  return { available, notYet };
}

/**
 * The full queue order after reordering only the "Available now" titles:
 * every slot an available title held is refilled, in order, from
 * `availableOrder`; "Not out yet" titles keep their slots. Ids not in the
 * queue are ignored; queued available ids missing from `availableOrder` keep
 * their relative order after the given ones.
 */
export function mergeAvailableOrder(fullOrder: string[], availableIds: string[], availableOrder: string[]): string[] {
  const avail = new Set(availableIds);
  const inQueue = new Set(fullOrder);
  const given = [...new Set(availableOrder)].filter((id) => avail.has(id) && inQueue.has(id));
  const rest = fullOrder.filter((id) => avail.has(id) && !given.includes(id));
  const fill = [...given, ...rest];
  let k = 0;
  return fullOrder.map((id) => (avail.has(id) ? fill[k++] : id));
}
