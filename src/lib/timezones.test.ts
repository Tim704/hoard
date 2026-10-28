import { describe, expect, it } from 'vitest';

import { countryForTimeZone, isValidTimeZone, knownRegions } from './timezones';

describe('countryForTimeZone', () => {
  it('maps canonical IANA zones to their country', () => {
    expect(countryForTimeZone('Europe/Berlin')).toBe('DE');
    expect(countryForTimeZone('Europe/Busingen')).toBe('DE');
    expect(countryForTimeZone('America/New_York')).toBe('US');
    expect(countryForTimeZone('Asia/Tokyo')).toBe('JP');
    expect(countryForTimeZone('Europe/London')).toBe('GB');
    expect(countryForTimeZone('Australia/Sydney')).toBe('AU');
    expect(countryForTimeZone('Asia/Kolkata')).toBe('IN');
    expect(countryForTimeZone('Europe/Kyiv')).toBe('UA');
  });

  it('maps legacy names browsers still report', () => {
    expect(countryForTimeZone('Asia/Calcutta')).toBe('IN');
    expect(countryForTimeZone('Europe/Kiev')).toBe('UA');
    expect(countryForTimeZone('Asia/Saigon')).toBe('VN');
    expect(countryForTimeZone('US/Eastern')).toBe('US');
  });

  it('tolerates whitespace and case', () => {
    expect(countryForTimeZone(' europe/berlin ')).toBe('DE');
  });

  it('returns null for UTC-style, empty and unknown zones', () => {
    expect(countryForTimeZone('UTC')).toBeNull();
    expect(countryForTimeZone('Etc/GMT+2')).toBeNull();
    expect(countryForTimeZone('')).toBeNull();
    expect(countryForTimeZone('Mars/Olympus')).toBeNull();
    expect(countryForTimeZone('constructor')).toBeNull();
  });
});

describe('knownRegions / isValidTimeZone', () => {
  it('lists unique two-letter codes', () => {
    const r = knownRegions();
    expect(r).toContain('DE');
    expect(new Set(r).size).toBe(r.length);
    expect(r.every((c) => /^[A-Z]{2}$/.test(c))).toBe(true);
  });

  it('checks zones with Intl', () => {
    expect(isValidTimeZone('Europe/Berlin')).toBe(true);
    expect(isValidTimeZone('Nowhere/Land')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
