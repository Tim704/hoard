'use client';

import { AlignJustify, LayoutGrid, Rows3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { ViewMode } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  /** Extra classes for the segmented-control container (toolbar ordering). */
  className?: string;
}

const MODES: { mode: ViewMode; label: string; Icon: typeof LayoutGrid }[] = [
  { mode: 'grid', label: 'Grid view', Icon: LayoutGrid },
  { mode: 'list', label: 'List view', Icon: Rows3 },
  { mode: 'compact', label: 'Compact view', Icon: AlignJustify },
];

/** Three-button segmented control: grid, list and compact views. */
export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5',
        className,
      )}
    >
      {MODES.map(({ mode, label, Icon }) => (
        <Button
          key={mode}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
          className={cn(
            // Slightly larger touch targets on phones; original 32px at md+.
            'h-9 w-9 md:h-8 md:w-8',
            value === mode && 'bg-background text-foreground shadow-sm',
          )}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
}
