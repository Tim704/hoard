'use client';

// ───────────────────────────────────────────────────────────────────────────
//  Settings → Themes: the layout picker (four thumbnails; picking one
//  switches the whole app at once, with Undo in the toast) and the title
//  view (a short popup or a full page). Both go through useSetDisplayPref,
//  which shows the choice straight away and rolls it back if the save fails.
//  Then the dashboard tiles: the dashboard's Customize editor, inline, which
//  saves on Save.
// ───────────────────────────────────────────────────────────────────────────

import { useId } from 'react';
import { Check } from 'lucide-react';

import { TileEditor } from '@/components/dashboard/tile-editor';
import { LayoutThumbnail, TitleViewThumbnail } from '@/components/layout-thumbnails';
import { usePrefs, useSetDisplayPref } from '@/components/prefs-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardTilesPref } from '@/lib/dashboard-tiles';
import { TITLE_VIEWS, TITLE_VIEW_LABELS, type TitleView } from '@/lib/display-prefs';
import { LAYOUT_IDS, LAYOUTS } from '@/lib/layouts';
import { cn } from '@/lib/utils';

const TITLE_VIEW_DESCRIPTIONS: Record<TitleView, string> = {
  popup: 'A short popup over the page: status, score, favorite, progress and notes, and a link to the full page.',
  page: 'Its own page, with the history, seasons, sessions, tags, lists and the rest.',
};

export function SettingsThemes({ dashboard }: { dashboard: DashboardTilesPref }) {
  const { layout, titleView, hiddenSections } = usePrefs();
  const sectionsHidden = hiddenSections.some((s) => s !== 'franchises');
  const set = useSetDisplayPref();

  return (
    <>
      <Card id="layout" className="scroll-mt-bar">
        <CardHeader>
          <CardTitle className="text-base">Layout</CardTitle>
          <CardDescription>
            How Hoard looks: the navigation, the cards, the spacing, the colours and the fonts. It changes as you pick
            one, and Undo takes you back.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ThumbnailPicker
            name="layout"
            legend="Layout"
            value={layout}
            onChange={(v) => set('layout', v)}
            options={LAYOUT_IDS.map((id) => ({
              value: id,
              label: LAYOUTS[id].label,
              description: LAYOUTS[id].description,
              thumbnail: <LayoutThumbnail layout={id} />,
            }))}
          />
          <p className="text-xs text-muted-foreground">
            Fresh is always dark; the others follow your light or dark choice.
          </p>
        </CardContent>
      </Card>

      <Card id="title-view" className="scroll-mt-bar">
        <CardHeader>
          <CardTitle className="text-base">Title view</CardTitle>
          <CardDescription>What opens when you click a title, whichever layout you use.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThumbnailPicker
            name="titleView"
            legend="Title view"
            value={titleView}
            onChange={(v) => set('titleView', v)}
            className="max-w-md"
            options={TITLE_VIEWS.map((view) => ({
              value: view,
              label: TITLE_VIEW_LABELS[view],
              description: TITLE_VIEW_DESCRIPTIONS[view],
              thumbnail: <TitleViewThumbnail view={view} />,
            }))}
          />
        </CardContent>
      </Card>

      <Card id="dashboard-tiles" className="scroll-mt-bar">
        <CardHeader>
          <CardTitle className="text-base">Dashboard tiles</CardTitle>
          <CardDescription>
            Which tiles the dashboard shows, and in what order: drag a tile or use its arrows, then Save. Customize on
            the dashboard opens the same list.
            {sectionsHidden && ' Sections you hide under General aren’t listed; their tiles keep their places.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* A new saved value (after Save, Undo or another tab's change) shows in it, unless it has unsaved edits. */}
          <TileEditor saved={dashboard} className="max-w-xl" />
        </CardContent>
      </Card>
    </>
  );
}

/**
 * A radio group drawn as thumbnails, two per row. Native radios: Tab reaches
 * the chosen one, the arrow keys move (and choose), the label is the hit area.
 */
function ThumbnailPicker<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  className,
}: {
  name: string;
  legend: string;
  options: { value: T; label: string; description: string; thumbnail: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const base = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      <div className={cn('grid grid-cols-2 gap-3 sm:gap-4', className)}>
        {options.map((o) => {
          const checked = o.value === value;
          const labelId = `${base}-${o.value}-label`;
          const descId = `${base}-${o.value}-desc`;
          return (
            <label key={o.value} className="group relative block min-w-0 cursor-pointer">
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                aria-labelledby={labelId}
                aria-describedby={descId}
                className="peer sr-only"
              />
              {/* Chosen: a ring set off from the thumbnail, which reads on any
                  palette (dark mode's primary is near-white, like Classic's
                  thumbnail). Keyboard focus: an outline further out. */}
              <span
                className={cn(
                  'relative block overflow-hidden rounded-lg border border-border transition-shadow',
                  'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[6px] peer-focus-visible:outline-ring',
                  checked
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-card'
                    : 'group-hover:ring-1 group-hover:ring-muted-foreground/40 group-hover:ring-offset-2 group-hover:ring-offset-card',
                )}
              >
                {o.thumbnail}
                {checked && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow ring-2 ring-card">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                )}
              </span>
              <span className="mt-2 block">
                <span id={labelId} className={cn('block text-sm', checked ? 'font-semibold' : 'font-medium')}>
                  {o.label}
                </span>
                <span id={descId} className="mt-0.5 block text-xs text-muted-foreground">
                  {o.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
