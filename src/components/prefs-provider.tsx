'use client';

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';

import { detectRegion } from '@/lib/actions/prefs';
import { DEFAULT_DISPLAY_PREFS, type DisplayPrefs } from '@/lib/display-prefs';
import { formatScore, formatScoreOutOf } from '@/lib/rating';
import { displayTitle, type TitledMedia } from '@/lib/title';

const PrefsContext = createContext<DisplayPrefs>(DEFAULT_DISPLAY_PREFS);

/**
 * Hands the user's display settings (score format, hidden sections, …) to
 * client components. Provided once by the (app) layout from the server-read
 * prefs; outside it, components see the defaults.
 */
export function PrefsProvider({
  prefs,
  detectRegion: detect = false,
  children,
}: {
  prefs: DisplayPrefs;
  /** True only until the region was first detected or chosen (needsRegionDetection). */
  detectRegion?: boolean;
  children: React.ReactNode;
}) {
  return (
    <PrefsContext.Provider value={prefs}>
      {detect && <RegionDetector />}
      {children}
    </PrefsContext.Provider>
  );
}

export function usePrefs(): DisplayPrefs {
  return useContext(PrefsContext);
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
