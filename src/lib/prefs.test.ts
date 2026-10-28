import { describe, expect, it } from 'vitest';

import { CATEGORY_LIST } from './categories';
import {
  DEFAULT_DISPLAY_PREFS,
  DEFAULT_PREFS,
  HIDEABLE_SECTIONS,
  PrefsPatchSchema,
  effectiveTimeZone,
  parsePrefs,
  toDisplayPrefs,
} from './prefs';

describe('parsePrefs', () => {
  it('gives the defaults for empty or non-object JSON', () => {
    for (const raw of [{}, null, undefined, 'x', 42, [1, 2]]) {
      expect(parsePrefs(raw)).toEqual(DEFAULT_PREFS);
    }
    expect(DEFAULT_PREFS.scoreFormat).toBe('ten');
    expect(DEFAULT_PREFS.weekStart).toBe(1);
    expect(DEFAULT_PREFS.titleLanguage).toBe('english');
    expect(DEFAULT_PREFS.compareOptIn).toBe(false);
    expect(DEFAULT_PREFS.feedOptIn).toBe(false);
  });

  it('keeps valid values', () => {
    const p = parsePrefs({
      region: 'US',
      timeZone: 'America/New_York',
      scoreFormat: 'hundred',
      titleLanguage: 'romaji',
      weekStart: 0,
      hiddenSections: ['music', 'franchises'],
      notify: { ntfyUrl: 'https://ntfy.sh/hoard', discordWebhook: null, kinds: ['releases'] },
      compareOptIn: true,
    });
    expect(p.region).toBe('US');
    expect(p.timeZone).toBe('America/New_York');
    expect(p.scoreFormat).toBe('hundred');
    expect(p.titleLanguage).toBe('romaji');
    expect(p.weekStart).toBe(0);
    expect(p.hiddenSections).toEqual(['music', 'franchises']);
    expect(p.notify.ntfyUrl).toBe('https://ntfy.sh/hoard');
    expect(p.compareOptIn).toBe(true);
  });

  it('falls back field by field and drops unknown keys', () => {
    const p = parsePrefs({
      region: 'germany',
      timeZone: 'Mars/Olympus',
      scoreFormat: 'stars',
      weekStart: 9,
      hiddenSections: ['books', 'nope'],
      titleLanguage: 'native',
      surprise: true,
    });
    expect(p.region).toBeNull();
    expect(p.timeZone).toBeNull();
    expect(p.scoreFormat).toBe('ten');
    expect(p.weekStart).toBe(1);
    expect(p.hiddenSections).toEqual([]);
    expect(p.titleLanguage).toBe('native');
    expect(p).not.toHaveProperty('surprise');
  });

  it('dedupes hidden sections', () => {
    expect(parsePrefs({ hiddenSections: ['tv', 'tv'] }).hiddenSections).toEqual(['tv']);
  });
});

describe('PrefsPatchSchema', () => {
  it('accepts a partial patch and rejects invalid values', () => {
    expect(PrefsPatchSchema.safeParse({ scoreFormat: 'five' }).success).toBe(true);
    expect(PrefsPatchSchema.safeParse({ region: null }).success).toBe(true);
    expect(PrefsPatchSchema.safeParse({ scoreFormat: 'stars' }).success).toBe(false);
    expect(PrefsPatchSchema.safeParse({ timeZone: 'Nowhere/Land' }).success).toBe(false);
    expect(PrefsPatchSchema.safeParse({ region: 'de' }).success).toBe(false);
    expect(PrefsPatchSchema.safeParse({ hiddenSections: ['dashboard'] }).success).toBe(false);
  });

  it('never lets the client set the calendar token', () => {
    const r = PrefsPatchSchema.parse({ calendarToken: 'abc', weekStart: 0 });
    expect(r).toEqual({ weekStart: 0 });
  });
});

describe('sections and display prefs', () => {
  it('lets every category and Franchises be hidden', () => {
    for (const c of CATEGORY_LIST) expect(HIDEABLE_SECTIONS).toContain(c.slug);
    expect(HIDEABLE_SECTIONS).toContain('franchises');
  });

  it('exposes no account ids or tokens to the client', () => {
    const d = toDisplayPrefs(parsePrefs({ steamId: '123', calendarToken: 'secret' }));
    expect(Object.keys(d).sort()).toEqual(
      ['hiddenSections', 'region', 'scoreFormat', 'timeZone', 'titleLanguage', 'weekStart'],
    );
  });

  it('keeps the client-side defaults in step with the schema', () => {
    expect(DEFAULT_DISPLAY_PREFS).toEqual(toDisplayPrefs(parsePrefs({})));
  });

  it('uses the server time zone when the user has none', () => {
    expect(effectiveTimeZone({ timeZone: 'Asia/Tokyo' })).toBe('Asia/Tokyo');
    expect(typeof effectiveTimeZone({ timeZone: null })).toBe('string');
  });
});
