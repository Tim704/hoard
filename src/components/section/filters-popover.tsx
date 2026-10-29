'use client';

import { useId } from 'react';
import { Layers, ListTree, RotateCcw, SlidersHorizontal } from 'lucide-react';

import type { SectionFiltersState } from '@/components/section/use-section-filters';
import { TagFilter } from '@/components/tag-filter';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { CategorySlug } from '@/lib/categories';
import type { ToolbarStyle } from '@/lib/layouts';
import { hasOwnership } from '@/lib/ownership';
import { activeFilterCount, SORT_LABEL, SORT_MODES, type SortMode, type StatusFilter } from '@/lib/section-filters';
import { STATUSES, statusLabel } from '@/lib/status';
import { cn } from '@/lib/utils';

interface FiltersPopoverProps {
  slug: CategorySlug;
  state: SectionFiltersState;
  /** Owned platforms (games) or formats present in the section. */
  ownedChoices: { value: string; label: string }[];
  /** The section's tags, most used first. */
  sectionTags: string[];
  style: ToolbarStyle;
}

/**
 * The section toolbar's Filters button and popover: status, sort, owned
 * platform / format (where the section has one), tags, the two groupings and
 * Reset. The button counts the settings that differ from the defaults.
 */
export function FiltersPopover({ slug, state, ownedChoices, sectionTags, style }: FiltersPopoverProps) {
  const { filters, set, reset } = state;
  const count = activeFilterCount(filters);
  const id = useId();
  const games = slug === 'games';
  const showOwned = hasOwnership(slug) && (!games || ownedChoices.length > 0);
  const showTags = sectionTags.length > 0 || filters.tags.length > 0;
  const name = count > 0 ? `Filters (${count} active)` : 'Filters';

  const pill = count > 0 && (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none text-primary-foreground',
        style === 'icons' && 'absolute -right-1.5 -top-1.5 ring-2 ring-background',
      )}
    >
      {count}
    </span>
  );

  const trigger =
    style === 'labelled' ? (
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={name}
          data-filter-count={count}
          className="h-10 shrink-0 px-3 sm:px-4 md:h-9"
        >
          <SlidersHorizontal className="h-4 w-4 sm:mr-2" aria-hidden />
          <span className="hidden sm:inline">Filters</span>
          {pill}
        </Button>
      </PopoverTrigger>
    ) : (
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={name}
              data-filter-count={count}
              className="relative h-10 w-10 shrink-0 md:h-9 md:w-9"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              {pill}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Filters</TooltipContent>
      </Tooltip>
    );

  return (
    <Popover>
      {trigger}
      <PopoverContent align="end" className="w-80 p-0" aria-labelledby={`${id}-title`}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 id={`${id}-title`} className="text-sm font-semibold">
            Filters
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={count === 0}
            onClick={reset}
            className="-mr-2 h-8 px-2 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reset
          </Button>
        </div>

        <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 px-4 py-3">
          <Label htmlFor={`${id}-status`} className="text-xs text-muted-foreground">
            Status
          </Label>
          <Select value={filters.status} onValueChange={(v) => set('status', v as StatusFilter)}>
            <SelectTrigger id={`${id}-status`} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s, slug)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Label htmlFor={`${id}-sort`} className="text-xs text-muted-foreground">
            Sort
          </Label>
          <Select value={filters.sort} onValueChange={(v) => set('sort', v as SortMode)}>
            <SelectTrigger id={`${id}-sort`} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_MODES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SORT_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {showOwned && (
            <>
              <Label htmlFor={`${id}-owned`} className="text-xs text-muted-foreground">
                {games ? 'Owned on' : 'Format'}
              </Label>
              <Select value={filters.owned} onValueChange={(v) => set('owned', v)}>
                <SelectTrigger id={`${id}-owned`} className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{games ? 'Any platform' : 'Any format'}</SelectItem>
                  {ownedChoices.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="NONE">{games ? 'No platform set' : 'No format set'}</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}

          {showTags && (
            <>
              <span className="text-xs font-medium text-muted-foreground">Tags</span>
              <TagFilter
                tags={sectionTags}
                selected={filters.tags}
                onChange={(t) => set('tags', t)}
                className="h-9 w-full min-w-0 justify-start md:h-9"
              />
            </>
          )}
        </div>

        <div className="space-y-2.5 border-t border-border px-4 py-3">
          <Toggle
            icon={Layers}
            label="Group franchises"
            checked={filters.groupFranchises}
            onChange={(v) => set('groupFranchises', v)}
          />
          <Toggle icon={ListTree} label="Group by status" checked={filters.grouped} onChange={(v) => set('grouped', v)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Toggle({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: typeof Layers;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      {label}
    </label>
  );
}
