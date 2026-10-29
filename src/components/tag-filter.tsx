'use client';

import { Tag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { tagKey } from '@/lib/tags';
import { cn } from '@/lib/utils';

/**
 * A section page's tag filter (spec 4.2): pick any number of tags; a title
 * must carry all of them (AND).
 */
export function TagFilter({
  tags,
  selected,
  onChange,
  className,
}: {
  /** The section's tags, most used first. */
  tags: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  const isOn = (t: string) => selected.some((s) => tagKey(s) === tagKey(t));
  const toggle = (t: string) =>
    onChange(isOn(t) ? selected.filter((s) => tagKey(s) !== tagKey(t)) : [...selected, t]);
  // Selected tags from the URL that no title here has are still listed, so they can be cleared.
  const all = [...tags, ...selected.filter((s) => !tags.some((t) => tagKey(t) === tagKey(s)))];
  const shown = selected.length === 0 ? 'Tags' : selected.length === 1 ? selected[0] : `${selected.length} tags`;
  // The name holds what the button shows (label in name, WCAG 2.5.3) and
  // which tags: "Tags: any", "Tags: sci-fi", "3 tags: a, b, c".
  const name = selected.length === 0 ? 'Tags: any' : selected.length === 1 ? `Tags: ${selected[0]}` : `${shown}: ${selected.join(', ')}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={name}
          className={cn('h-10 md:h-9', selected.length > 0 && 'bg-accent text-accent-foreground', className)}
        >
          <Tag className="mr-2 h-4 w-4" aria-hidden />
          <span className="truncate">{shown}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Titles with all of these tags
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {all.map((t) => (
          <DropdownMenuCheckboxItem
            key={t}
            checked={isOn(t)}
            onCheckedChange={() => toggle(t)}
            onSelect={(e) => e.preventDefault()}
          >
            {t}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Clear tags</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
