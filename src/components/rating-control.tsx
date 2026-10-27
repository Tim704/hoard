'use client';

import { Star } from 'lucide-react';

import { formatRating } from '@/lib/rating';

interface RatingControlProps {
  value: number | null;
}

/** Display-only score: a compact "8.0/10" with a star (cards/tables). Editing lives in RatingInput. */
export function RatingControl({ value }: RatingControlProps) {
  if (value == null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-300">
      <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
      {formatRating(value)}/10
    </span>
  );
}
