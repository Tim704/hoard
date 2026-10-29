'use client';

import { useEffect, useState } from 'react';

import { getSeasons } from '@/lib/actions/seasons';

/**
 * Whether a TV show has a season list (then its progress is the sum of its
 * seasons, edited on the full page). Pass null for anything that isn't TV;
 * false until known.
 */
export function useHasSeasons(tvActivityId: string | null): boolean {
  const [known, setKnown] = useState<{ id: string; has: boolean } | null>(null);
  useEffect(() => {
    if (!tvActivityId) return;
    let live = true;
    getSeasons(tvActivityId).then(
      (res) => live && setKnown({ id: tvActivityId, has: Boolean(res.ok && res.seasons?.length) }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [tvActivityId]);
  return known != null && known.id === tvActivityId && known.has;
}
