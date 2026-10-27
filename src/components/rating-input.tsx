'use client';

import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRating, nudgeRating, parseRatingInput } from '@/lib/rating';
import { cn } from '@/lib/utils';

interface RatingInputProps {
  value: number | null;
  /** Called with the new one-decimal score (0–10). */
  onChange: (v: number) => void;
  /** When given, a "Skip" button is shown that calls this. */
  onSkip?: () => void;
  /**
   * Called on every keystroke in the text box with the parsed score (null when
   * the text is empty or invalid), before it is committed on Enter/blur. Lets a
   * parent enable a "Save" button as soon as a valid score is typed.
   */
  onDraftChange?: (v: number | null) => void;
  autoFocus?: boolean;
}

const PIPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * Interactive one-decimal 0–10 rating: ten pips (tap n → n), −0.1 / +0.1
 * nudge buttons and a small text box ("8,5" works) that commits on Enter/blur.
 * Pips ≤ floor(value) are highlighted.
 */
export function RatingInput({
  value,
  onChange,
  onSkip,
  onDraftChange,
  autoFocus,
}: RatingInputProps) {
  const [text, setText] = useState(value == null ? '' : formatRating(value));

  // Keep the box in step with the value (pips, nudges, server round-trips).
  useEffect(() => {
    setText(value == null ? '' : formatRating(value));
  }, [value]);

  function commitText() {
    const parsed = parseRatingInput(text);
    if (parsed === null) {
      // Invalid / out of range → revert, no call.
      setText(value == null ? '' : formatRating(value));
      return;
    }
    setText(formatRating(parsed));
    if (parsed !== value) onChange(parsed);
  }

  const floor = value == null ? 0 : Math.floor(value);

  return (
    <div className="space-y-2">
      {/* Phones: two rows of five full-width, 44px-tall cells (comfortable thumb
          targets). sm+ restores a single row of 28px pips. */}
      <div
        className="grid grid-cols-5 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-1"
        role="group"
        aria-label="Rating"
      >
        {PIPS.map((pip) => (
          <button
            key={pip}
            type="button"
            onClick={() => onChange(pip)}
            aria-label={`Rate ${pip} out of 10`}
            aria-pressed={value === pip}
            className={cn(
              'flex h-11 items-center justify-center rounded-md border text-sm font-medium transition-colors sm:h-7 sm:w-7 sm:text-xs',
              pip <= floor
                ? 'border-amber-500/40 bg-amber-500/20 text-amber-200'
                : 'border-border bg-muted/40 text-muted-foreground hover:border-amber-500/30 hover:text-amber-200',
            )}
          >
            {pip}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9"
          aria-label="Decrease rating by 0.1"
          onClick={() => onChange(nudgeRating(value, -0.1))}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </Button>
        <Input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onDraftChange?.(parseRatingInput(e.target.value));
          }}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitText();
            }
          }}
          autoFocus={autoFocus}
          placeholder="—"
          aria-label="Rating out of 10"
          className="h-9 w-16 px-2 text-center tabular-nums"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9"
          aria-label="Increase rating by 0.1"
          onClick={() => onChange(nudgeRating(value, 0.1))}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </Button>
        <span className="text-sm text-muted-foreground">/10</span>
        {onSkip && (
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onSkip}>
            Skip
          </Button>
        )}
      </div>
    </div>
  );
}
