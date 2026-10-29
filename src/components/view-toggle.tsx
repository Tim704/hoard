'use client';

import { AlignJustify, LayoutGrid, Rows3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ViewMode } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  /** Extra classes for the segmented-control container (toolbar ordering). */
  className?: string;
  /** Offer only these modes (default: all three). */
  modes?: ViewMode[];
  /** Name each button in a tooltip too (the icon toolbars). */
  tooltips?: boolean;
}

export const VIEW_MODES: { mode: ViewMode; label: string; Icon: typeof LayoutGrid }[] = [
  { mode: 'grid', label: 'Grid view', Icon: LayoutGrid },
  { mode: 'list', label: 'List view', Icon: Rows3 },
  { mode: 'compact', label: 'Compact view', Icon: AlignJustify },
];

/** Three-button segmented control: grid, list and compact views. */
export function ViewToggle({ value, onChange, className, modes, tooltips }: ViewToggleProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5',
        className,
      )}
    >
      {VIEW_MODES.filter((m) => !modes || modes.includes(m.mode)).map(({ mode, label, Icon }) => {
        const button = (
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
        );
        if (!tooltips) return button;
        return (
          <Tooltip key={mode}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
