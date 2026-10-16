'use client';

import { FranchiseGroupHeader, FranchiseStackCard } from '@/components/franchise-group';
import { MediaCard } from '@/components/media-card';
import type { ActivityWithMedia, DisplayUnit } from '@/lib/types';

interface MediaGridProps {
  units: DisplayUnit[];
  onSelect: (a: ActivityWithMedia) => void;
  /** Franchise ids whose groups are expanded. */
  expanded: Set<string>;
  onToggleGroup: (franchiseId: string) => void;
}

const COLS = 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

/**
 * Responsive poster grid (2 → 6 columns). Collapsed franchises render as a
 * stacked card; an expanded one spans the full row with its titles inside.
 */
export function MediaGrid({ units, onSelect, expanded, onToggleGroup }: MediaGridProps) {
  return (
    <div className={COLS}>
      {units.map((unit) => {
        if (unit.kind === 'item') {
          return (
            <MediaCard
              key={unit.activity.id}
              activity={unit.activity}
              onClick={() => onSelect(unit.activity)}
            />
          );
        }
        const { franchise, members } = unit;
        if (!expanded.has(franchise.id)) {
          return (
            <FranchiseStackCard
              key={franchise.id}
              franchise={franchise}
              members={members}
              expanded={false}
              onToggle={() => onToggleGroup(franchise.id)}
            />
          );
        }
        return (
          <div
            key={franchise.id}
            className="col-span-full space-y-3 rounded-xl border border-dashed border-border bg-muted/20 p-3"
          >
            <FranchiseGroupHeader
              franchise={franchise}
              members={members}
              onToggle={() => onToggleGroup(franchise.id)}
            />
            <div className={COLS}>
              {members.map((a) => (
                <MediaCard key={a.id} activity={a} onClick={() => onSelect(a)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
