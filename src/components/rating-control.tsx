'use client';

import { Star } from 'lucide-react';

import { cn } from '@/lib/utils';

interface RatingControlProps {
  value: number | null;
  /** Called with the clicked rating (1–10) in interactive mode. */
  onChange?: (v: number) => void;
  /** Read-only renders a compact "n/10" + star instead of clickable pips. */
  readOnly?: boolean;
}

const PIPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * A 1–10 rating widget.
 *  - read-only: a compact "8/10" with a single star icon (used on cards/tables).
 *  - interactive: a row of 10 clickable pips, highlighting all pips ≤ value.
 */
export function RatingControl({ value, onChange, readOnly }: RatingControlProps) {
  if (readOnly) {
    if (value == null) {
      return <span className="text-sm text-muted-foreground">—</span>;
    }
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-300">
        <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
        {value}/10
      </span>
    );
  }

  return (
    // Phones: two rows of five full-width, 44px-tall cells (comfortable thumb
    // targets). sm+ restores the original single row of 28px pips.
    <div
      className="grid grid-cols-5 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-1"
      role="group"
      aria-label="Rating"
    >
      {PIPS.map((pip) => {
        const active = value != null && pip <= value;
        return (
          <button
            key={pip}
            type="button"
            onClick={() => onChange?.(pip)}
            aria-label={`Rate ${pip} out of 10`}
            aria-pressed={value === pip}
            className={cn(
              'flex h-11 items-center justify-center rounded-md border text-sm font-medium transition-colors sm:h-7 sm:w-7 sm:text-xs',
              active
                ? 'border-amber-500/40 bg-amber-500/20 text-amber-200'
                : 'border-border bg-muted/40 text-muted-foreground hover:border-amber-500/30 hover:text-amber-200',
            )}
          >
            {pip}
          </button>
        );
      })}
    </div>
  );
}
