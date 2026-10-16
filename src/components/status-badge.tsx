'use client';

import { Badge } from '@/components/ui/badge';
import type { CategorySlug } from '@/lib/categories';
import {
  statusLabel,
  STATUS_BADGE_CLASS,
  STATUS_BASE_LABEL,
  STATUS_ICON,
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
 * Renders the status icon + category-appropriate label inside a tinted Badge.
 * The honest base label is exposed via the title attribute on hover.
 */
export function StatusBadge({ status, slug, className }: StatusBadgeProps) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge
      variant="outline"
      title={STATUS_BASE_LABEL[status]}
      className={cn(
        'w-fit gap-1 whitespace-nowrap font-medium',
        STATUS_BADGE_CLASS[status],
        className,
      )}
    >
      <Icon
        className={cn('h-3 w-3 shrink-0', status === 'CONSUMING' && 'fill-current')}
        aria-hidden
      />
      {statusLabel(status, slug)}
    </Badge>
  );
}
