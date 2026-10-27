import type { ActivityWithMedia } from '@/lib/types';

/** Gap between queue positions, so rewrites are always clean multiples. */
export const QUEUE_STEP = 1000;

/**
 * The Up next queue: PLANNED items only, by `queueOrder` ascending. Items with
 * no position yet (null) come last, oldest first.
 */
export function orderQueue(all: ActivityWithMedia[]): ActivityWithMedia[] {
  return all
    .filter((a) => a.status === 'PLANNED')
    .sort((a, b) => {
      if (a.queueOrder !== null && b.queueOrder !== null) return a.queueOrder - b.queueOrder;
      if (a.queueOrder !== null) return -1;
      if (b.queueOrder !== null) return 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

/** Position for an item joining the end of the queue. */
export function nextQueueOrder(maxQueueOrder: number | null): number {
  return maxQueueOrder === null ? QUEUE_STEP : maxQueueOrder + QUEUE_STEP;
}
