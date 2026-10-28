// ───────────────────────────────────────────────────────────────────────────
//  Last.fm "Mark as Listened?" (spec 8.3). Pure rules: when an album's plays
//  reach 80 % of its track count it is suggested (never marked), and which
//  suggestions are still worth showing. The suggestions live on the user's
//  ExternalLink(provider 'lastfm').data.suggested as activity ids.
// ───────────────────────────────────────────────────────────────────────────

export const LISTENED_SHARE = 0.8;
/** Most albums checked per night (all users together). */
export const LASTFM_NIGHTLY_LIMIT = 300;
/** Gap between two Last.fm calls (its limit is 5 a second). */
export const LASTFM_GAP_MS = 400;

/** True when the plays reach 80 % of a known, positive track count. */
export function suggestsListened(userPlays: number | null | undefined, trackCount: number | null | undefined): boolean {
  if (!trackCount || !Number.isFinite(trackCount) || trackCount <= 0) return false;
  if (userPlays == null || !Number.isFinite(userPlays) || userPlays <= 0) return false;
  return userPlays >= LISTENED_SHARE * trackCount;
}

/** The suggested activity ids stored in `data` (junk dropped, max 500). */
export function suggestedIds(data: unknown): string[] {
  const list = data && typeof data === 'object' && !Array.isArray(data) ? (data as { suggested?: unknown }).suggested : null;
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64))].slice(0, 500);
}

/** `data` with ids added to / removed from the suggestions, other keys kept. */
export function withSuggested(data: unknown, add: string[], remove: string[] = []): Record<string, unknown> {
  const base = data && typeof data === 'object' && !Array.isArray(data) ? { ...(data as Record<string, unknown>) } : {};
  const drop = new Set(remove);
  const next = [...new Set([...suggestedIds(data), ...add])].filter((id) => !drop.has(id)).slice(0, 500);
  return { ...base, suggested: next };
}
