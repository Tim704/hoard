import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_ANCHORS,
  SETTINGS_TABS,
  SETTINGS_TAB_LABELS,
  isSettingsTab,
  resolveSettingsTab,
  settingsHref,
  settingsRedirect,
  settingsTabsFor,
  tabForAnchor,
  upgradeSettingsLink,
  type SettingsTab,
} from './settings-nav';

describe('the tabs', () => {
  it('lists Themes first and System last, each with a label', () => {
    expect(SETTINGS_TABS[0]).toBe('themes');
    expect(SETTINGS_TABS.at(-1)).toBe('system');
    for (const tab of SETTINGS_TABS) expect(SETTINGS_TAB_LABELS[tab]).toBeTruthy();
  });

  it('defaults to General, so the old /settings still opens on the same cards', () => {
    expect(DEFAULT_SETTINGS_TAB).toBe('general');
  });

  it('shows System only to the owner', () => {
    expect(settingsTabsFor(true)).toEqual(SETTINGS_TABS);
    expect(settingsTabsFor(false)).toEqual(SETTINGS_TABS.filter((t) => t !== 'system'));
  });

  it('knows its tab ids and nothing else', () => {
    expect(isSettingsTab('themes')).toBe(true);
    for (const junk of ['', 'Themes', 'toString', '__proto__', null, undefined, 3, ['data']]) {
      expect(isSettingsTab(junk)).toBe(false);
    }
  });
});

describe('resolveSettingsTab', () => {
  it('takes a known ?tab=', () => {
    for (const tab of SETTINGS_TABS) expect(resolveSettingsTab({ tab }, true)).toBe(tab);
  });

  it('falls back to General for a missing or unknown tab', () => {
    expect(resolveSettingsTab({}, true)).toBe('general');
    expect(resolveSettingsTab({ tab: 'nope' }, true)).toBe('general');
    expect(resolveSettingsTab({ tab: ['data', 'system'] }, true)).toBe('general');
  });

  it('sends non-owners asking for System to General', () => {
    expect(resolveSettingsTab({ tab: 'system' }, false)).toBe('general');
    expect(resolveSettingsTab({ tab: 'data' }, false)).toBe('data');
  });

  it('opens Accounts for the AniList OAuth callback (?anilist=) without a tab', () => {
    expect(resolveSettingsTab({ anilist: 'connected' }, false)).toBe('accounts');
    expect(resolveSettingsTab({ tab: 'accounts', anilist: 'expired' }, false)).toBe('accounts');
    // An explicit tab wins; an unknown one doesn't.
    expect(resolveSettingsTab({ tab: 'themes', anilist: 'expired' }, false)).toBe('themes');
    expect(resolveSettingsTab({ tab: 'nope', anilist: 'expired' }, false)).toBe('accounts');
    expect(upgradeSettingsLink('/settings?tab=nope&anilist=expired')).toBe('/settings?tab=accounts&anilist=expired');
  });
});

describe('old #anchors', () => {
  it('maps every card anchor the old single page had to its tab', () => {
    const old: Record<string, SettingsTab> = {
      accounts: 'accounts',
      notifications: 'notifications',
      sharing: 'sharing',
      calendar: 'sharing',
      compare: 'sharing',
      feed: 'sharing',
      'api-tokens': 'data',
      system: 'system',
      // Removed cards land on General, where the rest of their old neighbours are.
      streaming: 'general',
      display: 'general',
      region: 'general',
    };
    for (const [anchor, tab] of Object.entries(old)) expect(tabForAnchor(anchor), anchor).toBe(tab);
  });

  it('accepts a leading # and any case, and ignores unknown anchors', () => {
    expect(tabForAnchor('#api-tokens')).toBe('data');
    expect(tabForAnchor('#Accounts')).toBe('accounts');
    expect(tabForAnchor('')).toBeNull();
    expect(tabForAnchor('#')).toBeNull();
    expect(tabForAnchor('#nope')).toBeNull();
    expect(tabForAnchor('toString')).toBeNull();
    expect(tabForAnchor('__proto__')).toBeNull();
  });

  it('maps each tab id as an anchor to itself', () => {
    for (const tab of SETTINGS_TABS) expect(tabForAnchor(tab)).toBe(tab);
  });
});

describe('settingsHref', () => {
  it('builds ?tab= links, with an optional card anchor', () => {
    expect(settingsHref('themes')).toBe('/settings?tab=themes');
    expect(settingsHref('data', 'api-tokens')).toBe('/settings?tab=data#api-tokens');
    expect(settingsHref('sharing', 'compare')).toBe('/settings?tab=sharing#compare');
  });

  it('only pairs an anchor with the tab that holds it', () => {
    for (const [anchor, tab] of Object.entries(SETTINGS_ANCHORS)) {
      expect(tabForAnchor(anchor)).toBe(tab);
      expect(upgradeSettingsLink(`/settings#${anchor}`)).toBe(`/settings?tab=${tab}#${anchor}`);
    }
  });
});

describe('upgradeSettingsLink', () => {
  it('rewrites the /settings#… links notifications already store', () => {
    expect(upgradeSettingsLink('/settings#system')).toBe('/settings?tab=system#system');
    expect(upgradeSettingsLink('/settings#accounts')).toBe('/settings?tab=accounts#accounts');
    expect(upgradeSettingsLink('/settings#notifications')).toBe('/settings?tab=notifications#notifications');
    expect(upgradeSettingsLink('/settings#api-tokens')).toBe('/settings?tab=data#api-tokens');
  });

  it('keeps other query params (the old AniList callback) and puts the tab first', () => {
    expect(upgradeSettingsLink('/settings?anilist=expired#accounts')).toBe(
      '/settings?tab=accounts&anilist=expired#accounts',
    );
    expect(upgradeSettingsLink('/settings?anilist=connected')).toBe('/settings?tab=accounts&anilist=connected');
  });

  it('leaves links that already name a tab, plain /settings and other pages alone', () => {
    for (const href of [
      '/settings',
      '/settings?tab=data#api-tokens',
      '/settings?tab=general#accounts',
      '/settings#nope',
      '/settings/other#accounts',
      '/settingsx#accounts',
      '/tv?open=abc',
      'https://hoard.example/settings#system',
      '',
    ]) {
      expect(upgradeSettingsLink(href), href).toBe(href);
    }
  });

  it('replaces an unknown ?tab= instead of keeping it', () => {
    expect(upgradeSettingsLink('/settings?tab=nope#compare')).toBe('/settings?tab=sharing#compare');
  });
});

describe('settingsRedirect', () => {
  const owner = settingsTabsFor(true);
  const member = settingsTabsFor(false);

  it('stays put on links that are already right', () => {
    for (const href of ['/settings', '/settings?tab=data#api-tokens', '/settings?tab=themes', '/settings#nope']) {
      expect(settingsRedirect(href, owner), href).toBeNull();
    }
    expect(settingsRedirect('/settings?tab=system#system', owner)).toBeNull();
  });

  it('upgrades old-style links', () => {
    expect(settingsRedirect('/settings#api-tokens', member)).toBe('/settings?tab=data#api-tokens');
    expect(settingsRedirect('/settings#system', owner)).toBe('/settings?tab=system#system');
    expect(settingsRedirect('/settings?anilist=expired#accounts', member)).toBe(
      '/settings?tab=accounts&anilist=expired#accounts',
    );
  });

  it("sends a non-owner's System link to a clean General", () => {
    expect(settingsRedirect('/settings#system', member)).toBe('/settings?tab=general');
    expect(settingsRedirect('/settings?tab=system', member)).toBe('/settings?tab=general');
    expect(settingsRedirect('/settings?tab=system#system', member)).toBe('/settings?tab=general');
  });

  it('replaces an unknown tab with the one shown, keeping a card that is on it', () => {
    expect(settingsRedirect('/settings?tab=nope', owner)).toBe('/settings?tab=general');
    expect(settingsRedirect('/settings?tab=nope&x=1#display', owner)).toBe('/settings?tab=general&x=1#display');
    expect(settingsRedirect('/settings?tab=nope&anilist=denied', member)).toBe('/settings?tab=accounts&anilist=denied');
  });

  it('ignores other pages', () => {
    expect(settingsRedirect('/books?tab=system', member)).toBeNull();
  });
});
