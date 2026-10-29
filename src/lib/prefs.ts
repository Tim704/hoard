// ───────────────────────────────────────────────────────────────────────────
//  User settings (`User.prefs`). The column is free-form JSON, so every read
//  goes through `parsePrefs`: missing or invalid fields fall back to their
//  defaults one by one, and unknown keys are dropped. Writes go through the
//  strict `PrefsPatchSchema` (see src/lib/actions/prefs.ts).
//
//  Pure and client-safe (no prisma import); `getPrefs` lives in
//  src/lib/data-prefs.ts so client components can import the types and option
//  lists from here. The display slice and its defaults live in the zod-free
//  src/lib/display-prefs.ts, which every page's bundle includes.
// ───────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

import { TILE_IDS } from '@/lib/dashboard-tile-ids';
import { TITLE_VIEWS, type DisplayPrefs, type HideableSection, type TitleLanguage, type TitleView } from '@/lib/display-prefs';
import { DEFAULT_LAYOUT, LAYOUT_IDS, type LayoutId } from '@/lib/layouts';
import type { ScoreFormat } from '@/lib/rating';
import { isValidTimeZone } from '@/lib/timezones';
import { pushUrlProblem } from '@/lib/url-safety';

export type { DisplayPrefs, HideableSection, LayoutId, ScoreFormat, TitleLanguage, TitleView };
export { DEFAULT_DISPLAY_PREFS, TITLE_VIEWS } from '@/lib/display-prefs';
export { LAYOUT_IDS } from '@/lib/layouts';

export const SCORE_FORMATS = ['ten', 'five', 'hundred'] as const satisfies readonly ScoreFormat[];
export const TITLE_LANGUAGES = ['english', 'romaji', 'native'] as const satisfies readonly TitleLanguage[];

/** Sections that can be hidden from the navigation and the dashboard. */
export const HIDEABLE_SECTIONS = [
  'books',
  'movies',
  'anime',
  'games',
  'tv',
  'manga',
  'music',
  'franchises',
] as const satisfies readonly HideableSection[];

// ── Strict field schemas (used as-is for writes) ───────────────────────────

const region = z.string().regex(/^[A-Z]{2}$/, 'Region must be a two-letter country code.').nullable();
const timeZone = z
  .string()
  .refine(isValidTimeZone, 'Unknown time zone.')
  .nullable();
const optionalText = z.string().trim().max(200).nullable();

/** Notification kinds (src/lib/notify.ts). `test` is the Settings "Send test". */
export const NOTIFY_KINDS = ['releases', 'new-seasons', 'backup', 'sync', 'list-shared', 'lastfm'] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number] | 'test';

/**
 * Push targets (the user's own ntfy topic / Discord webhook): https only, and
 * never localhost or a private / loopback / link-local IP literal.
 */
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .superRefine((u, ctx) => {
    const problem = pushUrlProblem(u);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

/**
 * `kinds` lists the kinds pushed to ntfy/Discord; empty means every kind. The
 * in-app list (Notifications, in the user menu) always shows every notification.
 */
const NotifySchema = z.object({
  ntfyUrl: httpsUrl.nullable().catch(null),
  discordWebhook: httpsUrl.nullable().catch(null),
  kinds: z.array(z.string().max(40)).max(50).catch([]),
});

/** The strict write form: invalid URLs are rejected, not silently cleared. */
const NotifyPatchSchema = z.object({
  ntfyUrl: httpsUrl.nullable(),
  discordWebhook: httpsUrl.nullable(),
  kinds: z.array(z.enum(NOTIFY_KINDS)).max(NOTIFY_KINDS.length),
});

/**
 * The dashboard's tiles: their order and the hidden ones. Read leniently: the
 * ids stay plain strings (src/lib/dashboard-tiles.ts drops unknown ones), and
 * a list that isn't an array of at most 50 short strings reads as empty.
 */
const tileIdList = z.array(z.string().max(40)).max(50);
const DashboardSchema = z.object({
  order: tileIdList.catch([]),
  hidden: tileIdList.catch([]),
});

/** The strict write form: known tile ids only, each at most once. */
const knownTileIds = z
  .array(z.enum(TILE_IDS))
  .max(TILE_IDS.length)
  .refine((ids) => new Set(ids).size === ids.length, 'A dashboard tile is listed twice.');
const DashboardPatchSchema = z.object({ order: knownTileIds, hidden: knownTileIds });

const fields = {
  // Region and display
  region,
  timeZone,
  scoreFormat: z.enum(SCORE_FORMATS),
  titleLanguage: z.enum(TITLE_LANGUAGES),
  weekStart: z.number().int().min(0).max(6), // 0 = Sunday, 1 = Monday
  hiddenSections: z.array(z.enum(HIDEABLE_SECTIONS)).max(HIDEABLE_SECTIONS.length),
  // Themes: the layout (src/lib/layouts.ts), how a title opens, the dashboard tiles
  layout: z.enum(LAYOUT_IDS),
  titleView: z.enum(TITLE_VIEWS),
  dashboard: DashboardSchema,
  // Legacy: the removed "Where to watch" services (TMDB provider ids). Still
  // read and exported so stored data stays readable; never patched.
  streamingServices: z.array(z.number().int().positive()).max(100),
  // Accounts
  steamId: optionalText,
  lastfmUser: optionalText,
  anilistUser: optionalText,
  // Notifications
  notify: NotifySchema,
  // Sharing with other users (off by default, see spec G2)
  compareOptIn: z.boolean(),
  feedOptIn: z.boolean(),
  // Calendar feed token (generated server-side, never patched by the client)
  calendarToken: z.string().nullable(),
  // True once the region was detected or chosen, so "Not set" stays not set.
  regionDetected: z.boolean(),
};

export const DEFAULT_PREFS = {
  region: null,
  timeZone: null,
  scoreFormat: 'ten',
  titleLanguage: 'english',
  weekStart: 1,
  hiddenSections: [],
  layout: DEFAULT_LAYOUT,
  titleView: 'popup',
  dashboard: { order: [], hidden: [] },
  streamingServices: [],
  steamId: null,
  lastfmUser: null,
  anilistUser: null,
  notify: { ntfyUrl: null, discordWebhook: null, kinds: [] },
  compareOptIn: false,
  feedOptIn: false,
  calendarToken: null,
  regionDetected: false,
} satisfies z.input<z.ZodObject<typeof fields>>;

/** Lenient read schema: each field falls back to its default on its own. */
export const PrefsSchema = z.object({
  region: fields.region.catch(DEFAULT_PREFS.region),
  timeZone: fields.timeZone.catch(DEFAULT_PREFS.timeZone),
  scoreFormat: fields.scoreFormat.catch(DEFAULT_PREFS.scoreFormat),
  titleLanguage: fields.titleLanguage.catch(DEFAULT_PREFS.titleLanguage),
  weekStart: fields.weekStart.catch(DEFAULT_PREFS.weekStart),
  hiddenSections: fields.hiddenSections
    .transform((s) => [...new Set(s)])
    .catch(DEFAULT_PREFS.hiddenSections),
  layout: fields.layout.catch(DEFAULT_PREFS.layout),
  titleView: fields.titleView.catch(DEFAULT_PREFS.titleView),
  dashboard: fields.dashboard.catch(DEFAULT_PREFS.dashboard),
  streamingServices: fields.streamingServices.catch(DEFAULT_PREFS.streamingServices),
  steamId: fields.steamId.catch(DEFAULT_PREFS.steamId),
  lastfmUser: fields.lastfmUser.catch(DEFAULT_PREFS.lastfmUser),
  anilistUser: fields.anilistUser.catch(DEFAULT_PREFS.anilistUser),
  notify: NotifySchema.catch(DEFAULT_PREFS.notify),
  compareOptIn: fields.compareOptIn.catch(DEFAULT_PREFS.compareOptIn),
  feedOptIn: fields.feedOptIn.catch(DEFAULT_PREFS.feedOptIn),
  calendarToken: fields.calendarToken.catch(DEFAULT_PREFS.calendarToken),
  regionDetected: fields.regionDetected.catch(DEFAULT_PREFS.regionDetected),
});

export type Prefs = z.output<typeof PrefsSchema>;

/** Strict write schema: every user-editable field, all optional. */
export const PrefsPatchSchema = z
  .object({
    region: fields.region,
    timeZone: fields.timeZone,
    scoreFormat: fields.scoreFormat,
    titleLanguage: fields.titleLanguage,
    weekStart: fields.weekStart,
    hiddenSections: fields.hiddenSections,
    layout: fields.layout,
    titleView: fields.titleView,
    dashboard: DashboardPatchSchema,
    // streamingServices is not here: Where to watch was removed (read-only now).
    // steamId / lastfmUser / anilistUser are not here: only the Accounts
    // actions (src/lib/actions/accounts.ts) write them, after validating.
    notify: NotifyPatchSchema,
    compareOptIn: fields.compareOptIn,
    feedOptIn: fields.feedOptIn,
  })
  .partial();

export type PrefsPatch = z.input<typeof PrefsPatchSchema>;

/** Parse the stored JSON. Never throws: anything unusable becomes the defaults. */
export function parsePrefs(raw: unknown): Prefs {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return PrefsSchema.parse(obj);
}

/** The settings the client needs for display (no tokens or account ids). */
export function toDisplayPrefs(p: Prefs): DisplayPrefs {
  return {
    region: p.region,
    timeZone: p.timeZone,
    scoreFormat: p.scoreFormat,
    titleLanguage: p.titleLanguage,
    weekStart: p.weekStart,
    hiddenSections: p.hiddenSections,
    layout: p.layout,
    titleView: p.titleView,
  };
}

/** Detect the region from the browser only once, and only while it was never set. */
export function needsRegionDetection(p: Pick<Prefs, 'region' | 'regionDetected'>): boolean {
  return !p.regionDetected && p.region === null;
}

/**
 * Apply an explicit settings patch. Choosing a region or time zone (even "Not
 * set" / "Server default") counts as a decision, so detection never reruns.
 */
export function applyPrefsPatch(current: Prefs, patch: z.output<typeof PrefsPatchSchema>): Prefs {
  const touchesRegion = 'region' in patch || 'timeZone' in patch;
  return { ...current, ...patch, ...(touchesRegion ? { regionDetected: true } : {}) };
}

/**
 * The first (and only) automatic detection: fill region and time zone from the
 * browser's zone where unset, and mark detection done. Null when not needed.
 */
export function detectedPrefs(
  current: Prefs,
  browserTimeZone: string,
  countryFor: (tz: string) => string | null,
  fallbackRegion: string,
): Prefs | null {
  if (!needsRegionDetection(current)) return null;
  return {
    ...current,
    region: countryFor(browserTimeZone) ?? fallbackRegion,
    timeZone: current.timeZone ?? (isValidTimeZone(browserTimeZone) ? browserTimeZone : null),
    regionDetected: true,
  };
}

/** The server's own zone (`TZ`, default Europe/Berlin), used when the user has none. */
export function serverTimeZone(): string {
  const tz = process.env.TZ;
  return tz && isValidTimeZone(tz) ? tz : 'Europe/Berlin';
}

/** The user's effective time zone. */
export function effectiveTimeZone(p: Pick<Prefs, 'timeZone'>): string {
  return p.timeZone ?? serverTimeZone();
}
