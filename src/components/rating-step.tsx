'use client';

import { useState } from 'react';

import { RatingInput } from '@/components/rating-input';
import { Button } from '@/components/ui/button';

interface RatingStepProps {
  onSave: (rating: number) => void;
  onSkip: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

/**
 * Score an item before committing: pips, nudges and typing only change a draft;
 * nothing is saved until "Save" (or "Skip" to finish without a score).
 */
export function RatingStep({ onSave, onSkip, autoFocus, disabled }: RatingStepProps) {
  const [draft, setDraft] = useState<number | null>(null);
  // Latest valid parse of the text box while typing (not yet committed by
  // blur/Enter). On phones the blur and the Save tap race, so Save must already
  // be enabled — and use the typed value — as soon as the text parses.
  const [typed, setTyped] = useState<number | null>(null);
  const score = typed ?? draft;

  function pick(v: number) {
    setDraft(v);
    setTyped(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <RatingInput
        value={draft}
        onChange={pick}
        onDraftChange={setTyped}
        autoFocus={autoFocus}
      />
      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || score === null}
          onClick={() => score !== null && onSave(score)}
        >
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}
