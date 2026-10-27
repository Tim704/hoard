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

  return (
    <div className="flex flex-wrap items-center gap-3">
      <RatingInput value={draft} onChange={setDraft} autoFocus={autoFocus} />
      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || draft === null}
          onClick={() => draft !== null && onSave(draft)}
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
