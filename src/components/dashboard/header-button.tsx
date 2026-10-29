'use client';

import { forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';

import { useLayout } from '@/components/prefs-provider';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Where Classic shows a header button's label; below that it is an icon with
 * a tooltip, like the other layouts everywhere. The dashboard header is one
 * line that never wraps, and the greeting beside the buttons truncates, so
 * the labels come in where the greeting keeps its room. CSS breakpoints only
 * (no measuring, so the server's HTML is final); like the section toolbar,
 * they allow for the expanded sidebar from md:
 * - Recommend across media: from lg;
 * - Customize: at sm (no sidebar yet), which md's sidebar folds again, and from xl.
 */
const LABEL_AT = {
  lg: { text: 'hidden lg:inline', icon: 'lg:mr-2', button: 'lg:w-auto lg:px-4', tip: 'lg:hidden' },
  'sm+xl': {
    text: 'hidden sm:inline md:hidden xl:inline',
    icon: 'sm:mr-2 md:mr-0 xl:mr-2',
    button: 'sm:w-auto sm:px-4 md:w-10 md:px-0 xl:w-auto xl:px-4',
    tip: 'sm:hidden md:block xl:hidden',
  },
} as const;

export type LabelAt = keyof typeof LABEL_AT;

interface HeaderButtonProps extends Omit<ButtonProps, 'children'> {
  icon: LucideIcon;
  /** The visible label (Classic). */
  label: string;
  /** The button's name and tooltip, when longer than the label (which it must contain). */
  name?: string;
  /** Classic: where the label shows (see LABEL_AT). */
  labelAt: LabelAt;
}

/**
 * An outlined button in the dashboard header: labelled in Classic (from
 * `labelAt`), an icon with a tooltip and an aria-label otherwise.
 */
export const HeaderButton = forwardRef<HTMLButtonElement, HeaderButtonProps>(function HeaderButton(
  { icon: Icon, label, name = label, labelAt, className, ...props },
  ref,
) {
  const labelled = useLayout().toolbar === 'labelled';
  const at = LABEL_AT[labelAt];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          type="button"
          variant="outline"
          size="icon"
          aria-label={name}
          className={cn(
            'shrink-0',
            // Icon buttons match the section toolbar's: 40px on phones, 36px from md.
            labelled ? ['h-10 w-10', at.button] : 'h-10 w-10 md:h-9 md:w-9',
            className,
          )}
          {...props}
        >
          <Icon className={cn('h-4 w-4', labelled && at.icon)} aria-hidden />
          {labelled && <span className={at.text}>{label}</span>}
        </Button>
      </TooltipTrigger>
      {/* Only while the label is hidden. */}
      <TooltipContent className={cn(labelled && at.tip)}>{name}</TooltipContent>
    </Tooltip>
  );
});
