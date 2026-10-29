'use client';

import { TitlePopup } from '@/components/title/title-popup';
import type { ActivityWithMedia } from '@/lib/types';

interface ActivityDetailDialogProps {
  activity: ActivityWithMedia | null;
  onClose: () => void;
  /**
   * The user's franchises. Unused since the franchise moved to the full
   * title page (which loads its own); kept so callers needn't change.
   */
  franchises?: { id: string; name: string }[];
}

/**
 * A title's details over the page: the short popup (src/components/title/
 * title-popup.tsx), with "Open full page" for everything else. Open when
 * `activity` is non-null.
 */
export function ActivityDetailDialog({ activity, onClose }: ActivityDetailDialogProps) {
  return <TitlePopup activity={activity} onClose={onClose} />;
}
