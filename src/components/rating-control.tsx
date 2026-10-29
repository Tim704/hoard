'use client';

import { Star } from 'lucide-react';

import { useScoreFormat } from '@/components/prefs-provider';

interface RatingControlProps {
  value: number | null;
}

/** Display-only score: a compact "8.0/10" (in the user's format) with a star. Editing lives in RatingInput. */
export function RatingControl({ value }: RatingControlProps) {
  const { scoreOutOfPlain } = useScoreFormat();
  if (value == null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-300">
      <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
      {scoreOutOfPlain(value)}
    </span>
  );
}
