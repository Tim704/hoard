'use client';

import { useCallback, useMemo, useState } from 'react';

import { usePersistentState } from '@/hooks/use-persistent-state';
import type { CategorySlug } from '@/lib/categories';
import {
  DEFAULT_FILTERS,
  isBool,
  isSortMode,
  sectionPrefKey,
  type SectionFilters,
  type SortMode,
  type StatusFilter,
} from '@/lib/section-filters';

export interface SectionFiltersState {
  filters: SectionFilters;
  set: <K extends keyof SectionFilters>(key: K, value: SectionFilters[K]) => void;
  /** "Clear filters": status, format and tags only; the saved sort and grouping stay. */
  clear: () => void;
  /** "Default sort & grouping": the remembered sort and both groupings back to the defaults. */
  resetView: () => void;
}

/**
 * A section page's filters (src/lib/section-filters.ts). Sort and both
 * groupings are remembered per section under their old localStorage keys;
 * status, format and tags last for the visit (tags may arrive in the URL).
 */
export function useSectionFilters(slug: CategorySlug, initialTags: string[] = []): SectionFiltersState {
  const [sort, setSort] = usePersistentState<SortMode>(sectionPrefKey(slug, 'sort'), DEFAULT_FILTERS.sort, isSortMode);
  const [grouped, setGrouped] = usePersistentState<boolean>(sectionPrefKey(slug, 'grouped'), DEFAULT_FILTERS.grouped, isBool);
  const [groupFranchises, setGroupFranchises] = usePersistentState<boolean>(
    sectionPrefKey(slug, 'franchises'),
    DEFAULT_FILTERS.groupFranchises,
    isBool,
  );
  const [status, setStatus] = useState<StatusFilter>(DEFAULT_FILTERS.status);
  const [owned, setOwned] = useState(DEFAULT_FILTERS.owned);
  const [tags, setTags] = useState<string[]>(initialTags);

  const filters = useMemo<SectionFilters>(
    () => ({ status, sort, owned, tags, groupFranchises, grouped }),
    [status, sort, owned, tags, groupFranchises, grouped],
  );

  const set = useCallback(
    <K extends keyof SectionFilters>(key: K, value: SectionFilters[K]) => {
      const v = value as SectionFilters[keyof SectionFilters];
      switch (key) {
        case 'status':
          return setStatus(v as StatusFilter);
        case 'sort':
          return setSort(v as SortMode);
        case 'owned':
          return setOwned(v as string);
        case 'tags':
          return setTags(v as string[]);
        case 'groupFranchises':
          return setGroupFranchises(v as boolean);
        case 'grouped':
          return setGrouped(v as boolean);
      }
    },
    [setSort, setGrouped, setGroupFranchises],
  );

  const clear = useCallback(() => {
    setStatus(DEFAULT_FILTERS.status);
    setOwned(DEFAULT_FILTERS.owned);
    setTags([]);
  }, []);

  const resetView = useCallback(() => {
    setSort(DEFAULT_FILTERS.sort);
    setGroupFranchises(DEFAULT_FILTERS.groupFranchises);
    setGrouped(DEFAULT_FILTERS.grouped);
  }, [setSort, setGrouped, setGroupFranchises]);

  return { filters, set, clear, resetView };
}
