'use client';

import { MediaCard } from '@/components/media-card';
import type { ActivityWithMedia } from '@/lib/types';

interface MediaGridProps {
  activities: ActivityWithMedia[];
  onSelect: (a: ActivityWithMedia) => void;
}

/** Responsive poster grid (2 → 6 columns) of MediaCards. */
export function MediaGrid({ activities, onSelect }: MediaGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {activities.map((activity) => (
        <MediaCard
          key={activity.id}
          activity={activity}
          onClick={() => onSelect(activity)}
        />
      ))}
    </div>
  );
}
