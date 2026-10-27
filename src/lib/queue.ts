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
export function orderQueue(all: ActivityWithMedia[]): ActivityWithMedia[] {
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
