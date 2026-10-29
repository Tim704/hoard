'use client';

import { FranchiseGroupHeader, FranchiseStackCard } from '@/components/franchise-group';
import { MediaCard } from '@/components/media-card';
import { useLayout } from '@/components/prefs-provider';
import type { ActivityWithMedia, DisplayUnit } from '@/lib/types';

interface MediaGridProps {
  units: DisplayUnit[];
  onSelect: (a: ActivityWithMedia) => void;
  /** A title's page (Full page title view): its card links there instead of calling onSelect. */
  hrefFor?: (a: ActivityWithMedia) => string | undefined;
  /** Franchise ids whose groups are expanded. */
  expanded: Set<string>;
  onToggleGroup: (franchiseId: string) => void;
  /** Under a status heading (cards that show no status needn't name it). */
  inStatusSection?: boolean;
}

/**
 * Responsive poster grid: the layout's columns per breakpoint (LAYOUTS[id].
 * gridCols; Classic's 2 → 6 as before) and its gap (--grid-gap). Collapsed
 * franchises render as a stacked card; an expanded one spans the full row
 * with its titles inside.
 */
export function MediaGrid({ units, onSelect, hrefFor, expanded, onToggleGroup, inStatusSection }: MediaGridProps) {
  const COLS = useLayout().gridCols;
  return (
    <div className={COLS}>
      {units.map((unit) => {
        if (unit.kind === 'item') {
          return (
            <MediaCard
              key={unit.activity.id}
              activity={unit.activity}
              onClick={() => onSelect(unit.activity)}
              href={hrefFor?.(unit.activity)}
              inStatusSection={inStatusSection}
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
              inStatusSection={inStatusSection}
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
                <MediaCard key={a.id} activity={a} onClick={() => onSelect(a)} href={hrefFor?.(a)} inStatusSection={inStatusSection} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
