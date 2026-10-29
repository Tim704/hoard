// ───────────────────────────────────────────────────────────────────────────
//  Settings is split into tabs (/settings?tab=…, a side menu on desktop and a
//  strip of tabs on phones). This module names the tabs, builds links to
//  them (`settingsHref`) and maps the card anchors of the old single page
//  (/settings#accounts, #api-tokens, …) to the tab that now holds each card,
//  because notifications and pushed messages already store such links.
//  Pure, so the mapping is unit-tested and usable on the client.
// ───────────────────────────────────────────────────────────────────────────

/** In side-menu order: Themes first. */
export const SETTINGS_TABS = ['themes', 'general', 'accounts', 'notifications', 'sharing', 'data', 'system'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/**
 * A bare /settings opens General: the old page started with the time zone
 * and display cards, so old deep links and habits land where they did.
 */
export const DEFAULT_SETTINGS_TAB: SettingsTab = 'general';

export const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  themes: 'Themes',
  general: 'General',
  accounts: 'Accounts',
  notifications: 'Notifications',
  sharing: 'Sharing & privacy',
  data: 'Data',
  system: 'System',
};

/**
 * Every card anchor (the card's `id`) and the tab that holds it, including
 * the anchors of cards that are gone (#streaming, #region → General). Each
 * tab id works as an anchor too.
 */
export const SETTINGS_ANCHORS = {
  themes: 'themes',
  layout: 'themes',
  'title-view': 'themes',
  general: 'general',
  'time-zone': 'general',
  display: 'general',
  sections: 'general',
  streaming: 'general',
  region: 'general',
  accounts: 'accounts',
  notifications: 'notifications',
  sharing: 'sharing',
  calendar: 'sharing',
  compare: 'sharing',
  feed: 'sharing',
  data: 'data',
  'api-tokens': 'data',
  system: 'system',
} as const satisfies Record<string, SettingsTab>;
export type SettingsAnchor = keyof typeof SETTINGS_ANCHORS;
/** The anchors of the cards on tab `T`. */
type AnchorOn<T extends SettingsTab> = {
  [A in SettingsAnchor]: (typeof SETTINGS_ANCHORS)[A] extends T ? A : never;
}[SettingsAnchor];

export function isSettingsTab(value: unknown): value is SettingsTab {
  return typeof value === 'string' && (SETTINGS_TABS as readonly string[]).includes(value);
}

/** The tabs a user sees: System (backups, job errors) only for the owner. */
export function settingsTabsFor(isOwner: boolean): readonly SettingsTab[] {
  return isOwner ? SETTINGS_TABS : SETTINGS_TABS.filter((t) => t !== 'system');
}

/**
 * The tab a /settings request shows. Unknown → General; System → General
 * for everyone but the owner; no valid tab but `?anilist=` (the AniList
 * OAuth callback, also in its pre-tabs form) → Accounts, as
 * upgradeSettingsLink does.
 */
export function resolveSettingsTab(
  search: { tab?: string | string[]; anilist?: string | string[] },
  isOwner: boolean,
): SettingsTab {
  let tab: SettingsTab = DEFAULT_SETTINGS_TAB;
  if (isSettingsTab(search.tab)) tab = search.tab;
  else if (search.anilist !== undefined) tab = 'accounts';
  return tab === 'system' && !isOwner ? DEFAULT_SETTINGS_TAB : tab;
}

/** "#api-tokens" / "api-tokens" → "data"; null for an unknown anchor. */
export function tabForAnchor(anchor: string): SettingsTab | null {
  const key = anchor.replace(/^#/, '').toLowerCase();
  return Object.hasOwn(SETTINGS_ANCHORS, key) ? SETTINGS_ANCHORS[key as SettingsAnchor] : null;
}

/** `/settings?tab=data#api-tokens`. The anchor must be a card on that tab. */
export function settingsHref<T extends SettingsTab>(tab: T, anchor?: AnchorOn<T>): string {
  return `/settings?tab=${tab}${anchor ? `#${anchor}` : ''}`;
}

/**
 * An old-style Settings link → its tabbed form: `/settings#api-tokens` →
 * `/settings?tab=data#api-tokens`, `/settings?anilist=x` →
 * `/settings?tab=accounts&anilist=x`. Links that already name a valid tab,
 * that name no known card, or that aren't an in-app /settings path come
 * back unchanged (so `upgraded !== href` means "go there instead").
 */
export function upgradeSettingsLink(href: string): string {
  const m = /^\/settings(\?[^#]*)?(#.*)?$/.exec(href);
  if (!m) return href;
  const params = new URLSearchParams(m[1] ?? '');
  if (isSettingsTab(params.get('tab'))) return href;
  const hash = m[2] ?? '';
  const tab = (hash ? tabForAnchor(hash) : null) ?? (params.has('anilist') ? 'accounts' : null);
  if (!tab) return href;
  params.delete('tab');
  const rest = params.toString();
  return `/settings?tab=${tab}${rest ? `&${rest}` : ''}${hash}`;
}
