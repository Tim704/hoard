'use client';

import { Badge } from '@/components/ui/badge';
import type { CategorySlug } from '@/lib/categories';
import {
  statusLabel,
  STATUS_BADGE_CLASS,
  STATUS_BASE_LABEL,
  type Status,
} from '@/lib/status';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: Status;
  /** Category slug, so the label reads naturally per domain (e.g. "Watching"). */
  slug?: CategorySlug;
  className?: string;
}

/**
 * Renders the category-appropriate status label inside a tinted Badge. The
 * honest base label is exposed via the title attribute for clarity on hover.
 */
export function StatusBadge({ status, slug, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      title={STATUS_BASE_LABEL[status]}
      className={cn(
        'whitespace-nowrap font-medium',
        STATUS_BADGE_CLASS[status],
        className,
      )}
    >
      {statusLabel(status, slug)}
    </Badge>
  );
}
