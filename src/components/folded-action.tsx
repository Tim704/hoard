'use client';

import { Link2Off, MoreHorizontal, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * A Settings row's last action, folded into a "⋯" menu where the row has no
 * room for it (CSS only, like the section toolbar's More), so the row stays
 * one line:
 * - `fold="sm"` (Accounts, whose rows stack on phones): a full-width button
 *   in the phone stack; from sm, the ⋯ menu at the end of the row;
 * - `fold="phone"` (Calendar, one row everywhere): the ⋯ menu on phones;
 *   from sm, a labelled button.
 */
export function FoldedAction({
  menuLabel,
  label,
  icon: Icon = Link2Off,
  onSelect,
  disabled,
  fold,
}: {
  /** The ⋯ button's name ("More Steam actions"). */
  menuLabel: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  disabled: boolean;
  fold: 'sm' | 'phone';
}) {
  const phone = fold === 'phone';
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={onSelect}
        disabled={disabled}
        className={phone ? 'hidden shrink-0 sm:inline-flex' : 'w-full sm:hidden'}
      >
        <Icon className="mr-2 h-4 w-4" aria-hidden />
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            aria-label={menuLabel}
            title={menuLabel}
            className={cn('w-9 shrink-0 px-0', phone ? 'sm:hidden' : 'hidden sm:inline-flex')}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onSelect}>
            <Icon className="mr-2 h-4 w-4" aria-hidden />
            {label}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
