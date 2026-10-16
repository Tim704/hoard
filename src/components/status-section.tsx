'use client';

import { ChevronDown } from 'lucide-react';

import { StatusIcon } from '@/components/status-icon';
import type { CategorySlug } from '@/lib/categories';
import { statusLabel, type Status } from '@/lib/status';
import { cn } from '@/lib/utils';

interface StatusSectionProps {
  status: Status;
  slug: CategorySlug;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * A collapsible group of items sharing one status: a header row (chevron, icon,
 * natural label, count) that toggles the body.
 */
export function StatusSection({
  status,
  slug,
  count,
  collapsed,
  onToggle,
  children,
}: StatusSectionProps) {
  const bodyId = `section-${slug}-${status}`;
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        className="group flex w-full items-center gap-2.5 border-b border-border pb-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            collapsed && '-rotate-90',
          )}
          aria-hidden
        />
        <StatusIcon status={status} />
        <span className="text-base font-semibold">{statusLabel(status, slug)}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
      </button>
      {!collapsed && <div id={bodyId}>{children}</div>}
    </section>
  );
}
