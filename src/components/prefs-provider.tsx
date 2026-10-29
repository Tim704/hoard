'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { toastUndoable } from '@/components/undo-toast';
import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';
import { detectRegion, updatePrefs } from '@/lib/actions/prefs';
import {
  NONE_IN_FLIGHT,
  liveSlice,
  reconcileOverlay,
  withOverlay,
  type InFlight,
  type LivePrefKey,
  type LivePrefs,
  type Overlay,
} from '@/lib/display-overlay';
import { DEFAULT_DISPLAY_PREFS, TITLE_VIEW_LABELS, type DisplayPrefs } from '@/lib/display-prefs';
import { applyLayoutToDocument } from '@/lib/document-theme';
import { LAYOUTS, resolveLayout, type LayoutConfig } from '@/lib/layouts';
import type { PrefsPatch } from '@/lib/prefs';
import { formatScore, formatScoreOutOf } from '@/lib/rating';
import { displayTitle, type TitledMedia } from '@/lib/title';

const PrefsContext = createContext<DisplayPrefs>(DEFAULT_DISPLAY_PREFS);
/** Today in the user's time zone (YYYY-MM-DD), computed on the server so hydration agrees. */
const TodayContext = createContext<string | null>(null);

/** Switch a live display pref (layout, title view) at once, save it, offer Undo. */
export type SetDisplayPref = <K extends LivePrefKey>(key: K, value: LivePrefs[K]) => void;
const SetDisplayPrefContext = createContext<SetDisplayPref>(() => {});

const SWITCH_MESSAGES: { [K in LivePrefKey]: (value: LivePrefs[K]) => string } = {
  layout: (v) => `Layout: ${LAYOUTS[resolveLayout(v)].label}`,
  titleView: (v) => `Title view: ${TITLE_VIEW_LABELS[v] ?? v}`,
};

/**
 * Hands the user's display settings (score format, hidden sections, …) to
 * client components. Provided once by the (app) layout from the server-read
 * prefs; outside it, components see the defaults.
 *
 * The layout and the title view switch instantly (useSetDisplayPref): the new
 * value shows as an overlay over the server's prefs while it saves, and the
 * overlay goes once the server has caught up (src/lib/display-overlay.ts).
 */
export function PrefsProvider({
  prefs,
  detectRegion: detect = false,
  today = null,
  children,
}: {
  prefs: DisplayPrefs;
  /** Today in the user's effective time zone (G10), for countdowns (5.9). */
  today?: string | null;
  /** True only until the region was first detected or chosen (needsRegionDetection). */
  detectRegion?: boolean;
  children: React.ReactNode;
}) {
  const server = liveSlice(prefs);
  const [seen, setSeen] = useState<LivePrefs>(server);
  const [overlay, setOverlay] = useState<Overlay>({});
  const [inFlight, setInFlight] = useState<InFlight>(NONE_IN_FLIGHT);

  // Reconciled while rendering (React's "adjust state when a prop changes").
  const reconciled = reconcileOverlay(overlay, seen, server, inFlight);
  if (reconciled !== overlay) setOverlay(reconciled);
  if (seen.layout !== server.layout || seen.titleView !== server.titleView) setSeen(server);

  const value = useMemo(() => withOverlay(prefs, reconciled), [prefs, reconciled]);

  /** What the user sees now (for a change's "previous"), ahead of the next render. */
  const current = useRef<LivePrefs>(liveSlice(value));
  /** Per key, the number of the newest change: only that one may roll back. */
  const latest = useRef<InFlight>({ ...NONE_IN_FLIGHT });
  /**
   * The layout <html> was last switched to here. Null at first, so mounting
   * always applies: after a client-side login the head bootstrap hasn't run
   * for this user's layout.
   */
  const applied = useRef<string | null>(null);

  // <html data-layout> is rendered by the root layout from the server's prefs,
  // so a refresh can put it back while a newer choice is still saving. Keep
  // the document on what the user sees, and redo `dark` when the layout moves.
  useIsomorphicLayoutEffect(() => {
    current.current = liveSlice(value);
    if (applied.current !== value.layout || document.documentElement.dataset.layout !== value.layout) {
      applyLayoutToDocument(resolveLayout(value.layout));
      applied.current = value.layout;
    }
  });

  const change = useCallback(function change<K extends LivePrefKey>(key: K, next: LivePrefs[K], undoable: boolean) {
    const previous = current.current[key];
    if (previous === next) return;
    const seq = ++latest.current[key];
    const show = (v: LivePrefs[K]) => {
      current.current = { ...current.current, [key]: v };
      setOverlay((o) => ({ ...o, [key]: v }));
      if (key === 'layout') applyLayoutToDocument(resolveLayout(v));
    };
    show(next);
    setInFlight((f) => ({ ...f, [key]: f[key] + 1 }));
    updatePrefs({ [key]: next } as PrefsPatch)
      .catch(() => ({ ok: false as const, error: undefined }))
      .then((res) => {
        if (res.ok) {
          if (undoable) toastUndoable(SWITCH_MESSAGES[key](next), () => change(key, previous, false));
          else toast.success('Undone.');
          return;
        }
        // Only the newest change rolls back; an older one is already overridden.
        if (latest.current[key] === seq) show(previous);
        toast.error(res.error ?? 'Could not save that setting.');
      })
      .finally(() => setInFlight((f) => ({ ...f, [key]: f[key] - 1 })));
  }, []);

  const setDisplayPref = useCallback<SetDisplayPref>((key, next) => change(key, next, true), [change]);

  return (
    <PrefsContext.Provider value={value}>
      <SetDisplayPrefContext.Provider value={setDisplayPref}>
        <TodayContext.Provider value={today}>
          {detect && <RegionDetector />}
          {children}
        </TodayContext.Provider>
      </SetDisplayPrefContext.Provider>
    </PrefsContext.Provider>
  );
}

export function usePrefs(): DisplayPrefs {
  return useContext(PrefsContext);
}

/** The current layout's config (src/lib/layouts.ts); Classic outside the (app) layout. */
export function useLayout(): LayoutConfig {
  return LAYOUTS[resolveLayout(usePrefs().layout)];
}

/**
 * `set('layout', 'fresh')` / `set('titleView', 'page')`: shows the change at
 * once, saves it, and toasts "Layout: Fresh · Undo"; a failed save rolls back
 * with an error toast. A no-op outside the (app) layout.
 */
export function useSetDisplayPref(): SetDisplayPref {
  return useContext(SetDisplayPrefContext);
}

/** Today (YYYY-MM-DD) in the user's time zone; null outside the (app) layout. */
export function useToday(): string | null {
  return useContext(TodayContext);
}

/** Score formatters bound to the user's chosen format. */
export function useScoreFormat() {
  const { scoreFormat } = usePrefs();
  return {
    format: scoreFormat,
    /** "8.5" · "4.3★" · "85" */
    score: (v: number | null) => formatScore(v, scoreFormat),
    /** "8.5/10" · "4.3★" · "85/100" */
    scoreOutOf: (v: number | null) => formatScoreOutOf(v, scoreFormat),
    /** For places that already draw a star icon: "8.5" · "4.3" · "85" */
    scorePlain: (v: number | null) => formatScore(v, scoreFormat, { star: false }),
    /** For places that already draw a star icon: "8.5/10" · "4.3/5" · "85/100" */
    scoreOutOfPlain: (v: number | null) => formatScoreOutOf(v, scoreFormat, { star: false }),
  };
}

/**
 * `(media) => title` in the user's title language (spec 4.9): anime and manga
 * show their English / romaji / native title; everything else its `title`.
 */
export function useDisplayTitle(): (media: TitledMedia) => string {
  const { titleLanguage } = usePrefs();
  return useCallback((media: TitledMedia) => displayTitle(media, titleLanguage), [titleLanguage]);
}

/** A media title in the user's title language, for server components (cf. `Score`). */
export function MediaTitle({ media }: { media: TitledMedia }) {
  return <>{useDisplayTitle()(media)}</>;
}

/**
 * On the first visit (region never detected or chosen), sends the browser's time zone (never a location)
 * once so the server can fill in region and time zone. Renders nothing.
 */
function RegionDetector() {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    let tz = '';
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    } catch {
      // Ancient browser: the server falls back to the default region.
    }
    void detectRegion(tz).catch(() => {});
  }, []);
  return null;
}

/**
 * A score as text in the user's format, for server components that cannot
 * call hooks: `<Score value={8.5} />` → "8.5" / "4.3★" / "85".
 */
export function Score({
  value,
  outOf = false,
  star = true,
}: {
  value: number | null;
  outOf?: boolean;
  /** false where a star icon is already drawn next to the score. */
  star?: boolean;
}) {
  const f = useScoreFormat();
  const text = outOf
    ? star ? f.scoreOutOf(value) : f.scoreOutOfPlain(value)
    : star ? f.score(value) : f.scorePlain(value);
  return <>{text}</>;
}
