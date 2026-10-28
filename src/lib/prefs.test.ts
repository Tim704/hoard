import { describe, expect, it } from 'vitest';

import { CATEGORY_LIST } from './categories';
import {
  applyPrefsPatch,
  detectedPrefs,
  needsRegionDetection,
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

describe('region detection', () => {
  const country = (tz: string) => (tz === 'Europe/Berlin' ? 'DE' : tz === 'Asia/Tokyo' ? 'JP' : null);

  it('runs once for a fresh user and fills region and time zone', () => {
    const fresh = parsePrefs({});
    expect(needsRegionDetection(fresh)).toBe(true);
    const next = detectedPrefs(fresh, 'Asia/Tokyo', country, 'DE');
    expect(next).toMatchObject({ region: 'JP', timeZone: 'Asia/Tokyo', regionDetected: true });
    expect(needsRegionDetection(next!)).toBe(false);
    expect(detectedPrefs(next!, 'Europe/Berlin', country, 'DE')).toBeNull();
  });

  it('falls back for unknown zones and keeps an existing time zone', () => {
    const p = parsePrefs({ timeZone: 'Asia/Tokyo' });
    expect(detectedPrefs(p, 'UTC', country, 'DE')).toMatchObject({ region: 'DE', timeZone: 'Asia/Tokyo' });
    expect(detectedPrefs(parsePrefs({}), 'Nowhere/Land', country, 'DE')).toMatchObject({ region: 'DE', timeZone: null });
  });

  it('skips users who already have a region (from before the flag)', () => {
    expect(needsRegionDetection(parsePrefs({ region: 'US' }))).toBe(false);
  });

  it('keeps an explicit "Not set" / "Server default" choice', () => {
    const detected = detectedPrefs(parsePrefs({}), 'Europe/Berlin', country, 'DE')!;
    const cleared = applyPrefsPatch(detected, { region: null, timeZone: null });
    expect(cleared).toMatchObject({ region: null, timeZone: null, regionDetected: true });
    expect(needsRegionDetection(cleared)).toBe(false);
    // even if the user clears it before detection ever ran
    expect(needsRegionDetection(applyPrefsPatch(parsePrefs({}), { region: null }))).toBe(false);
  });

  it('other settings do not count as choosing a region', () => {
    expect(applyPrefsPatch(parsePrefs({}), { scoreFormat: 'five' }).regionDetected).toBe(false);
  });

  it('the client cannot set the flag directly', () => {
    expect(PrefsPatchSchema.parse({ regionDetected: true })).toEqual({});
  });
});

describe('notification URLs', () => {
  it('accepts only https URLs when saving', () => {
    const ok = PrefsPatchSchema.safeParse({
      notify: { ntfyUrl: 'https://ntfy.sh/my-topic', discordWebhook: null, kinds: [] },
    });
    expect(ok.success).toBe(true);
    for (const bad of ['http://ntfy.sh/my-topic', 'ntfy.sh/my-topic', 'javascript:alert(1)']) {
      const res = PrefsPatchSchema.safeParse({
        notify: { ntfyUrl: null, discordWebhook: bad, kinds: [] },
      });
      expect(res.success).toBe(false);
    }
  });

  it('rejects localhost and private IP literals when saving', () => {
    for (const bad of ['https://localhost/x', 'https://192.168.1.2/x', 'https://[::1]/x', 'https://100.100.1.1/x']) {
      const res = PrefsPatchSchema.safeParse({
        notify: { ntfyUrl: bad, discordWebhook: null, kinds: [] },
      });
      expect(res.success, bad).toBe(false);
      if (!res.success) expect(res.error.issues[0].message).toBe('Local and private network addresses are not accepted.');
    }
  });

  it('rejects unknown kinds when saving', () => {
    const res = PrefsPatchSchema.safeParse({
      notify: { ntfyUrl: null, discordWebhook: null, kinds: ['nope'] },
    });
    expect(res.success).toBe(false);
  });

  it('drops a stored non-https URL on read', () => {
    const p = parsePrefs({ notify: { ntfyUrl: 'http://ntfy.sh/x', discordWebhook: null, kinds: [] } });
    expect(p.notify.ntfyUrl).toBeNull();
  });
});

describe('account fields (8.1–8.3)', () => {
  it('are read from storage but never patched through Settings', () => {
    const parsed = PrefsPatchSchema.parse({ steamId: '76561197960287930', lastfmUser: 'x', anilistUser: 'y', weekStart: 1 });
    expect(parsed).toEqual({ weekStart: 1 });
    expect(parsePrefs({ steamId: '76561197960287930' }).steamId).toBe('76561197960287930');
  });
});
