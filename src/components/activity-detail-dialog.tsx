'use client';

import { TitlePopup } from '@/components/title/title-popup';
import type { ActivityWithMedia } from '@/lib/types';

interface ActivityDetailDialogProps {
  activity: ActivityWithMedia | null;
  onClose: () => void;
}

/**
 * A title's details over the page: the short popup (src/components/title/
 * title-popup.tsx), with "Open full page" for everything else. Open when
 * `activity` is non-null.
 */
export function ActivityDetailDialog({ activity, onClose }: ActivityDetailDialogProps) {
  return <TitlePopup activity={activity} onClose={onClose} />;
}
