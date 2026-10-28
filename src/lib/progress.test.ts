import { describe, expect, it } from 'vitest';
import {
  parseProgressInput,
  progressFraction,
  progressShownByDefault,
  progressText,
  progressTotal,
  tracksProgress,
  validProgress,
} from './progress';
import { makeActivity } from './test-fixtures';

const withMedia = (category: Parameters<typeof makeActivity>[0]['category'], extra: Record<string, unknown>) => {
  const a = makeActivity({ id: 'x', category });
  return { ...a, media: { ...a.media, ...extra } };
};

describe('progressTotal', () => {
  it('reads the count for each tracked medium', () => {
    expect(progressTotal(withMedia('books', { pageCount: 320 }))).toBe(320);
    expect(progressTotal(withMedia('manga', { chapters: 150 }))).toBe(150);
    expect(progressTotal(withMedia('anime', { episodes: 24 }))).toBe(24);
    expect(progressTotal(withMedia('tv', { episodeCount: 62 }))).toBe(62);
    expect(progressTotal(withMedia('music', { trackCount: 11 }))).toBe(11);
  });

  it('is null when unknown, zero, or the medium has no units', () => {
    expect(progressTotal(withMedia('books', {}))).toBeNull();
    expect(progressTotal(withMedia('anime', { episodes: null }))).toBeNull();
    expect(progressTotal(withMedia('anime', { episodes: 0 }))).toBeNull();
    expect(progressTotal(withMedia('movies', { runtime: 120 }))).toBeNull();
    expect(progressTotal(withMedia('games', { timeToBeatHours: 30 }))).toBeNull();
    // Another medium's column is never used.
    expect(progressTotal(withMedia('books', { episodes: 12 }))).toBeNull();
  });
});

describe('progress helpers', () => {
  it('tracks every medium but movies and games', () => {
    expect(tracksProgress('movies')).toBe(false);
    expect(tracksProgress('games')).toBe(false);
    expect(tracksProgress('books')).toBe(true);
  });

  it('hides music progress until it is used', () => {
    expect(progressShownByDefault({ category: 'music', progress: null })).toBe(false);
    expect(progressShownByDefault({ category: 'music', progress: 3 })).toBe(true);
    expect(progressShownByDefault({ category: 'anime', progress: null })).toBe(true);
    expect(progressShownByDefault({ category: 'movies', progress: null })).toBe(false);
  });

  it('formats and clamps', () => {
    expect(progressText('books', 120, 240)).toBe('120 / 240 pages');
    expect(progressText('anime', 1, null)).toBe('1 episode');
    expect(progressText('tv', 1, 1)).toBe('1 / 1 episode');
    expect(progressFraction(30, 24)).toBe(1);
    expect(progressFraction(6, 24)).toBe(0.25);
    expect(progressFraction(6, null)).toBeNull();
    expect(progressFraction(null, 24)).toBeNull();
  });

  it('parses typed input', () => {
    expect(parseProgressInput(' 120 ')).toBe(120);
    expect(parseProgressInput('')).toBeNull();
    expect(parseProgressInput('0')).toBe(0);
    expect(parseProgressInput('-1')).toBeUndefined();
    expect(parseProgressInput('1.5')).toBeUndefined();
    expect(parseProgressInput('abc')).toBeUndefined();
    expect(parseProgressInput('9999999')).toBeUndefined();
  });

  it('validates stored values', () => {
    expect(validProgress(5)).toBe(5);
    expect(validProgress(5.5)).toBeNull();
    expect(validProgress(-1)).toBeNull();
    expect(validProgress('5')).toBeNull();
  });
});
