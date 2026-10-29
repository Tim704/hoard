// ───────────────────────────────────────────────────────────────────────────
//  Organised's cards show at most one small badge (src/lib/layouts.ts,
//  card: 'one-badge'): the one that matters most for the title right now.
//  Priority: new season > release countdown > "Mark as Listened?" >
//  progress > time to beat. Pure; the badges' own rules live with them.
// ───────────────────────────────────────────────────────────────────────────

import { showsListenBadge } from './lastfm-suggest';
import { formatTimeToBeat } from './media-meta';
import { progressFraction, progressText, progressTotal, tracksProgress } from './progress';
import { countdownLabel } from './release';
import type { ActivityWithMedia } from './types';

export type CardBadgeKind = 'new-season' | 'countdown' | 'listen' | 'progress' | 'time-to-beat';

export interface CardBadge {
  kind: CardBadgeKind;
  /** The badge's text, e.g. "New season", "in 12 days", "120 / 240 pages". */
  label: string;
  /** A longer description for a tooltip / accessible name. */
  title: string;
  /** Progress only: share done (0…1), or null without a known total. */
  fraction?: number | null;
}

type BadgeSubject = Pick<
  ActivityWithMedia,
  'category' | 'status' | 'progress' | 'media' | 'newSeason' | 'listenSuggested'
>;

/**
 * The one badge for a card, or null. `today` is the user's YYYY-MM-DD (null
 * before it is known, which skips the countdown).
 */
export function pickCardBadge(a: BadgeSubject, today: string | null): CardBadge | null {
  if (a.newSeason != null) {
    return { kind: 'new-season', label: 'New season', title: `Season ${a.newSeason} is out` };
  }
  if (today && a.status === 'PLANNED') {
    const label = countdownLabel(a.media, today);
    if (label) return { kind: 'countdown', label, title: `Out ${label}` };
  }
  if (showsListenBadge(a)) {
    return { kind: 'listen', label: 'Mark as Listened?', title: "Last.fm says you've played most of this album" };
  }
  if (a.status === 'CONSUMING' && a.progress != null && tracksProgress(a.category)) {
    const total = progressTotal(a);
    const label = progressText(a.category, a.progress, total);
    return { kind: 'progress', label, title: `Progress: ${label}`, fraction: progressFraction(a.progress, total) };
  }
  if (a.category === 'games') {
    const h = a.media.timeToBeatHours;
    const label = formatTimeToBeat(typeof h === 'number' ? h : null);
    if (label) return { kind: 'time-to-beat', label, title: `Time to beat: ${label}` };
  }
  return null;
}
