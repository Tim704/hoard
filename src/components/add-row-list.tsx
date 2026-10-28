'use client';

// A plain list of add rows (Done / Want, then the score step) for surfaces
// that just show provider titles: the anime season browser (5.11) and "More
// by the same people" (5.10). Keys are `slug:externalId`, like library marks.

import { AddResultRow, type useAddRows } from '@/components/add-row';
import type { CategorySlug } from '@/lib/categories';
import type { LibraryMarks } from '@/lib/data-search';
import type { NormalizedResult } from '@/lib/types';

export const addRowKey = (slug: CategorySlug, externalId: string) => `${slug}:${externalId}`;

export function AddRowList({
  items,
  marks,
  rows,
  label,
}: {
  items: Array<{ slug: CategorySlug; result: NormalizedResult; note?: string }>;
  marks: LibraryMarks;
  rows: ReturnType<typeof useAddRows>;
  label: string;
}) {
  return (
    <div role="listbox" aria-label={label} className="space-y-2">
      {items.map(({ slug, result, note }) => {
        const key = addRowKey(slug, result.externalId);
        return (
          <AddResultRow
            key={key}
            slug={slug}
            result={result}
            note={note}
            row={rows.rows[key]}
            inLibrary={marks[key] ?? null}
            onAdd={(status) => void rows.add(key, slug, result, status)}
            onRate={(v) => {
              const r = rows.rows[key];
              if (r?.phase === 'rating') void rows.saveRating(key, r.activityId, v);
            }}
            onSkipRate={() => rows.setRow(key, { phase: 'done', rating: null })}
          />
        );
      })}
    </div>
  );
}
