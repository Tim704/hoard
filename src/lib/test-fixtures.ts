import type { ActivityWithMedia } from '@/lib/types';

/** Test factory for activities; `media.title` defaults to the id. */
export function makeActivity(
  overrides: Partial<ActivityWithMedia> & { id: string },
): ActivityWithMedia {
  const { id, ...rest } = overrides;
  return {
    id,
    category: 'movies',
    status: 'COMPLETED',
    rating: null,
    tier: null,
    queueOrder: null,
    elo: 1200,
    duels: 0,
    tags: [],
    rankOrder: null,
    progress: null,
    favorite: false,
    notes: null,
    ownedPlatforms: [],
    format: null,
    rewatching: false,
    subScores: {},
    franchiseOrder: null,
    franchise: null,
    franchiseLocked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    media: {
      id: `m-${id}`,
      externalId: `ext-${id}`,
      title: id,
      imageUrl: null,
      description: null,
      year: null,
    },
    ...rest,
  };
}
