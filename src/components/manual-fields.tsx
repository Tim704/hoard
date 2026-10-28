'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CategorySlug } from '@/lib/categories';
import { MANUAL_FIELDS, type ManualInput } from '@/lib/manual';

/**
 * The inputs of a manual entry (spec 1.5): title, year, cover URL,
 * description and the medium's counts. Controlled; the parent owns the
 * buttons and validates with `parseManualInput`. Used by the Add dialog
 * ("Add it yourself") and the details dialog (editing a manual title).
 */
export function ManualFields({
  slug,
  value,
  onChange,
  disabled = false,
  idPrefix,
}: {
  slug: CategorySlug;
  value: ManualInput;
  onChange: (next: ManualInput) => void;
  disabled?: boolean;
  /** Keeps label/input ids unique when two forms could be mounted. */
  idPrefix: string;
}) {
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [key]: e.target.value });
  const id = (key: string) => `${idPrefix}-${key}`;
  // text-base on phones stops iOS zooming the page on focus (<16px does).
  const input = 'text-base sm:text-sm';

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={id('title')}>Title</Label>
        <Input
          id={id('title')}
          value={value.title ?? ''}
          onChange={set('title')}
          disabled={disabled}
          required
          maxLength={300}
          className={input}
          autoComplete="off"
        />
      </div>
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={id('year')}>Year</Label>
          <Input
            id={id('year')}
            value={value.year ?? ''}
            onChange={set('year')}
            disabled={disabled}
            inputMode="numeric"
            maxLength={4}
            className={input}
            autoComplete="off"
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={id('imageUrl')}>Cover URL</Label>
          <Input
            id={id('imageUrl')}
            value={value.imageUrl ?? ''}
            onChange={set('imageUrl')}
            disabled={disabled}
            type="url"
            inputMode="url"
            placeholder="https://…"
            className={input}
            autoComplete="off"
          />
        </div>
      </div>
      {MANUAL_FIELDS[slug].length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {MANUAL_FIELDS[slug].map((f) => (
            <div
              key={f.key}
              className={f.kind === 'int' ? 'space-y-1.5' : 'col-span-2 space-y-1.5'}
            >
              <Label htmlFor={id(f.key)}>{f.label}</Label>
              <Input
                id={id(f.key)}
                value={value[f.key] ?? ''}
                onChange={set(f.key)}
                disabled={disabled}
                inputMode={f.kind === 'int' ? 'numeric' : undefined}
                className={input}
                autoComplete="off"
              />
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={id('description')}>Description</Label>
        <Textarea
          id={id('description')}
          value={value.description ?? ''}
          onChange={set('description')}
          disabled={disabled}
          rows={3}
          maxLength={5000}
          className={input}
        />
      </div>
    </div>
  );
}
