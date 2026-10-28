'use client';

import { createContext, useContext, useEffect, useRef } from 'react';

import { detectRegion } from '@/lib/actions/prefs';
import { DEFAULT_DISPLAY_PREFS, type DisplayPrefs } from '@/lib/display-prefs';
import { formatScore, formatScoreOutOf } from '@/lib/rating';

const PrefsContext = createContext<DisplayPrefs>(DEFAULT_DISPLAY_PREFS);

/**
 * Hands the user's display settings (score format, hidden sections, …) to
 * client components. Provided once by the (app) layout from the server-read
 * prefs; outside it, components see the defaults.
 */
export function PrefsProvider({ prefs, children }: { prefs: DisplayPrefs; children: React.ReactNode }) {
  return (
    <PrefsContext.Provider value={prefs}>
      {prefs.region == null && <RegionDetector />}
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
  };
}

/**
 * While the region is unset, sends the browser's time zone (never a location)
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
export function Score({ value, outOf = false }: { value: number | null; outOf?: boolean }) {
  const f = useScoreFormat();
  return <>{outOf ? f.scoreOutOf(value) : f.score(value)}</>;
}
