'use client';

import { AddResultRow, useAddRows } from '@/components/add-row';
import { CATEGORIES } from '@/lib/categories';
import type { MissingView } from '@/lib/data-compare';
import type { NormalizedResult } from '@/lib/types';

/** The catalogue row an add button sends (the add path enriches it server-side). */
const resultOf = (it: MissingView): NormalizedResult => ({
  externalId: it.externalId,
  title: typeof it.fields.title === 'string' && it.fields.title ? it.fields.title : it.title,
  imageUrl: it.imageUrl,
  subtitle: null,
  year: it.year,
  description: null,
  fields: it.fields,
});

/** "Their S tier you haven't got" (9.1): each title with the usual add row. */
export function CompareSTier({ items }: { items: MissingView[] }) {
  const { rows, add, saveRating, setRow } = useAddRows();
  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const key = `${it.slug}:${it.externalId}`;
        return (
          <li key={key}>
            <AddResultRow
              slug={it.slug}
              result={resultOf(it)}
              row={rows[key]}
              note={CATEGORIES[it.slug].singular}
              onAdd={(status) => void add(key, it.slug, resultOf(it), status)}
              onRate={(rating) => {
                const r = rows[key];
                if (r?.phase === 'rating') void saveRating(key, r.activityId, rating);
              }}
              onSkipRate={() => setRow(key, { phase: 'done', rating: null })}
            />
          </li>
        );
      })}
    </ul>
  );
}
