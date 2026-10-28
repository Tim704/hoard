'use client';

// Any CSV (spec 2.7): map the file's columns to Hoard's fields, then each
// status value to a Hoard status, and hand the rows to the review screen.
// The mapping is remembered per set of headers on this device
// (src/lib/import/sources/generic.ts).

import { useMemo, useState } from 'react';
import { History } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORIES, NAV_ORDER, type CategorySlug } from '@/lib/categories';
import type { ParseResult } from '@/lib/import/rows';
import {
  buildStatusMap,
  distinctValues,
  GENERIC_FIELDS,
  initialMapping,
  mapGenericRecords,
  RATING_SCALES,
  saveMapping,
  statusKey,
  type GenericField,
  type GenericMapping,
  type MappingStorage,
  type RatingScale,
  type StatusChoice,
} from '@/lib/import/sources/generic';
import { STATUSES, statusLabel, type Status } from '@/lib/status';

const NONE = '__none';

const FIELD_LABEL: Record<GenericField, string> = {
  title: 'Title',
  year: 'Year',
  section: 'Section',
  status: 'Status',
  rating: 'Rating',
  platform: 'Platform (kept as a tag)',
  date: 'Date (finished or started)',
};

/** localStorage, or null where it is blocked (private windows, previews). */
function storage(): MappingStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

interface GenericMapperProps {
  fileName: string;
  headers: string[];
  records: Record<string, string>[];
  onRows: (result: ParseResult) => void;
  onCancel: () => void;
}

export function GenericMapper({ fileName, headers, records, onRows, onCancel }: GenericMapperProps) {
  const start = useMemo(() => initialMapping(storage(), headers), [headers]);
  const [mapping, setMapping] = useState<GenericMapping>(start.mapping);
  const statusValues = useMemo(() => distinctValues(records, mapping.columns.status), [records, mapping.columns.status]);
  // Values seen in the file → their choice (remembered, else the word's default).
  const statusMap = useMemo(
    () => buildStatusMap(statusValues, mapping.statusMap, mapping.defaultStatus),
    [statusValues, mapping.statusMap, mapping.defaultStatus],
  );
  const effective = useMemo(() => ({ ...mapping, statusMap }), [mapping, statusMap]);
  const preview = useMemo(() => mapGenericRecords(records, effective), [records, effective]);

  const setColumn = (field: GenericField, header: string) =>
    setMapping((m) => {
      const columns = { ...m.columns };
      if (header === NONE) delete columns[field];
      else columns[field] = header;
      return { ...m, columns };
    });

  const hasSectionColumn = Boolean(mapping.columns.section);
  const ready = Boolean(mapping.columns.title) && (hasSectionColumn || mapping.section !== null) && preview.rows.length > 0;
  const labelSlug = mapping.section ?? undefined;

  function submit() {
    saveMapping(storage(), headers, effective);
    onRows(preview);
  }

  return (
    <div className="space-y-5 rounded-lg border border-border bg-card p-3 sm:p-5">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Match the columns of {fileName}</h2>
          {start.remembered && (
            <Badge variant="outline" className="gap-1 text-xs font-normal">
              <History className="h-3 w-3" aria-hidden />
              Remembered from last time
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {records.length} line{records.length === 1 ? '' : 's'}. Only the title is required. This mapping is remembered on
          this device for files with the same columns.
        </p>
      </div>

      <section className="space-y-2" aria-labelledby="map-columns">
        <h3 id="map-columns" className="text-sm font-medium">
          1. Columns
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {GENERIC_FIELDS.map((field) => (
            <label key={field} className="space-y-1 text-sm">
              <span className="text-muted-foreground">
                {FIELD_LABEL[field]}
                {field === 'title' && ' *'}
              </span>
              <Select value={mapping.columns[field] ?? NONE} onValueChange={(v) => setColumn(field, v)}>
                <SelectTrigger aria-label={`Column for ${FIELD_LABEL[field].toLowerCase()}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not in this file</SelectItem>
                  {headers.filter(Boolean).map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Defaults">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">
            {hasSectionColumn ? 'Section when the cell is not recognised' : 'Section for every title *'}
          </span>
          <Select
            value={mapping.section ?? NONE}
            onValueChange={(v) => setMapping((m) => ({ ...m, section: v === NONE ? null : (v as CategorySlug) }))}
          >
            <SelectTrigger aria-label="Default section">
              <SelectValue placeholder="Pick a section" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{hasSectionColumn ? 'Skip those rows' : 'Pick a section…'}</SelectItem>
              {NAV_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {CATEGORIES[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Ratings are out of</span>
          <Select
            value={String(mapping.scale)}
            onValueChange={(v) => setMapping((m) => ({ ...m, scale: Number(v) as RatingScale }))}
            disabled={!mapping.columns.rating}
          >
            <SelectTrigger aria-label="Rating scale">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATING_SCALES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s === 5 ? '5 (stars)' : String(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Status when none is given</span>
          <Select value={mapping.defaultStatus} onValueChange={(v) => setMapping((m) => ({ ...m, defaultStatus: v as Status }))}>
            <SelectTrigger aria-label="Default status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s, labelSlug)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </section>

      {statusValues.length > 0 && (
        <section className="space-y-2" aria-labelledby="map-statuses">
          <h3 id="map-statuses" className="text-sm font-medium">
            2. Statuses in your file
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {statusValues.map((v) => {
              const key = statusKey(v);
              return (
                <li key={key} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
                  <span className="min-w-0 truncate" title={v}>
                    {v}
                  </span>
                  <Select
                    value={statusMap[key]}
                    onValueChange={(choice) =>
                      setMapping((m) => ({ ...m, statusMap: { ...m.statusMap, [key]: choice as StatusChoice } }))
                    }
                  >
                    <SelectTrigger className="h-8 w-36 shrink-0" aria-label={`Status for ${v}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabel(s, labelSlug)}
                        </SelectItem>
                      ))}
                      <SelectItem value="skip">Skip these</SelectItem>
                    </SelectContent>
                  </Select>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button type="button" disabled={!ready} onClick={submit}>
          Review {preview.rows.length} title{preview.rows.length === 1 ? '' : 's'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="text-xs text-muted-foreground">
          {!mapping.columns.title
            ? 'Pick the title column first.'
            : !hasSectionColumn && mapping.section === null
              ? 'Pick a section, or the column that holds it.'
              : preview.skipped > 0
                ? `${preview.skipped} line${preview.skipped === 1 ? '' : 's'} will be skipped.`
                : null}
        </span>
      </div>
    </div>
  );
}
