'use client';

// ───────────────────────────────────────────────────────────────────────────
//  The Settings page body. Every control saves on change through `updatePrefs`
//  (optimistically; a failed save rolls the control back). The server action
//  revalidates the layout, so score formats and hidden sections update across
//  the app straight away.
// ───────────────────────────────────────────────────────────────────────────

import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, Eye, EyeOff, LocateFixed } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { updatePrefs } from '@/lib/actions/prefs';
import { CATEGORIES } from '@/lib/categories';
import {
  HIDEABLE_SECTIONS,
  type DisplayPrefs,
  type HideableSection,
  type PrefsPatch,
  type ScoreFormat,
  type TitleLanguage,
} from '@/lib/prefs';
import { formatScore } from '@/lib/rating';
import { countryForTimeZone } from '@/lib/timezones';
import { cn } from '@/lib/utils';

interface SettingsFormProps {
  initial: DisplayPrefs;
  regions: { code: string; name: string }[];
  timeZones: string[];
  serverTimeZone: string;
  /** Extra cards rendered after the built-in ones (Notifications, System). */
  children?: React.ReactNode;
}

const SCORE_OPTIONS: { value: ScoreFormat; label: string }[] = [
  { value: 'ten', label: `0–10 (${formatScore(8.5, 'ten')})` },
  { value: 'five', label: `Stars (${formatScore(8.5, 'five')})` },
  { value: 'hundred', label: `0–100 (${formatScore(8.5, 'hundred')})` },
];

const LANGUAGE_OPTIONS: { value: TitleLanguage; label: string }[] = [
  { value: 'english', label: 'English' },
  { value: 'romaji', label: 'Romaji' },
  { value: 'native', label: 'Native' },
];

const WEEK_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Monday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

const SECTION_LABEL = (s: HideableSection) => (s === 'franchises' ? 'Franchises' : CATEGORIES[s].label);

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50';

export function SettingsForm({ initial, regions, timeZones, serverTimeZone, children }: SettingsFormProps) {
  const [prefs, setPrefs] = useState<DisplayPrefs>(initial);
  const [isPending, startTransition] = useTransition();

  function save(patch: PrefsPatch & Partial<DisplayPrefs>, message = 'Saved.') {
    const before = prefs;
    setPrefs({ ...prefs, ...patch });
    startTransition(async () => {
      const res = await updatePrefs(patch);
      if (res.ok) {
        toast.success(message);
      } else {
        setPrefs(before);
        toast.error(res.error ?? 'Could not save that setting.');
      }
    });
  }

  function applyBrowserZone() {
    let tz = '';
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    } catch {
      // fall through to the error below
    }
    const region = countryForTimeZone(tz);
    if (!tz) {
      toast.error('This browser did not report a time zone.');
      return;
    }
    save(
      region ? { timeZone: tz, region } : { timeZone: tz },
      region ? `Set to ${tz} (${region}).` : `Time zone set to ${tz}.`,
    );
  }

  function toggleSection(s: HideableSection) {
    const hidden = prefs.hiddenSections.includes(s)
      ? prefs.hiddenSections.filter((x) => x !== s)
      : [...prefs.hiddenSections, s];
    save({ hiddenSections: hidden });
  }

  // Keep a stored zone selectable even if this runtime lists it under another name.
  const zoneOptions =
    prefs.timeZone && !timeZones.includes(prefs.timeZone) ? [prefs.timeZone, ...timeZones] : timeZones;
  const regionOptions =
    prefs.region && !regions.some((r) => r.code === prefs.region)
      ? [{ code: prefs.region, name: prefs.region }, ...regions]
      : regions;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Changes save as you make them{isPending ? '…' : '.'}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Region and time</CardTitle>
          <CardDescription>
            The region picks streaming and release info. It comes from your browser&apos;s time zone,
            never your location.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="region" className="text-sm font-medium">
                Region
              </label>
              <select
                id="region"
                className={selectClass}
                value={prefs.region ?? ''}
                disabled={isPending}
                onChange={(e) => save({ region: e.target.value || null })}
              >
                <option value="">Not set</option>
                {regionOptions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="timeZone" className="text-sm font-medium">
                Time zone
              </label>
              <select
                id="timeZone"
                className={selectClass}
                value={prefs.timeZone ?? ''}
                disabled={isPending}
                onChange={(e) => save({ timeZone: e.target.value || null })}
              >
                <option value="">Server default ({serverTimeZone})</option>
                {zoneOptions.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={applyBrowserZone} disabled={isPending}>
            <LocateFixed className="mr-2 h-4 w-4" aria-hidden />
            Use this browser&apos;s time zone
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Display</CardTitle>
          <CardDescription>You always enter scores from 0 to 10; this only changes how they are shown.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Segmented
            label="Scores"
            options={SCORE_OPTIONS}
            value={prefs.scoreFormat}
            disabled={isPending}
            onChange={(v) => save({ scoreFormat: v })}
          />
          <Segmented
            label="Anime and manga titles"
            options={LANGUAGE_OPTIONS}
            value={prefs.titleLanguage}
            disabled={isPending}
            onChange={(v) => save({ titleLanguage: v })}
          />
          <Segmented
            label="Week starts on"
            options={WEEK_OPTIONS}
            value={prefs.weekStart}
            disabled={isPending}
            onChange={(v) => save({ weekStart: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sections</CardTitle>
          <CardDescription>
            Hidden sections leave the navigation and the dashboard. Their pages still work.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {HIDEABLE_SECTIONS.map((s) => {
              const isHidden = prefs.hiddenSections.includes(s);
              const Icon = isHidden ? EyeOff : Eye;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={!isHidden}
                  disabled={isPending}
                  onClick={() => toggleSection(s)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                    isHidden
                      ? 'border-dashed border-border text-muted-foreground line-through'
                      : 'border-primary/40 bg-accent text-accent-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {SECTION_LABEL(s)}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {children}
    </div>
  );
}

/** A row of mutually exclusive buttons (radio-group semantics). */
function Segmented<T extends string | number>({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  const labelId = useId();
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium" id={labelId}>
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => !active && onChange(o.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              {active && <Check className="h-3.5 w-3.5" aria-hidden />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
