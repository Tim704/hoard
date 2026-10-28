import { describe, expect, it } from 'vitest';

import {
  aniListIdFromKey,
  importPushTargets,
  MAX_IMPORT_PUSH_ROWS,
  sameAniListName,
  authorizeUrl,
  catalogueKeys,
  pulledEntries,
  pushVariables,
  resolveConflict,
  toAniListStatus,
} from './anilist-sync';
import type { ImportRow } from './import/types';

const remote = (over: Partial<ImportRow> = {}): ImportRow => ({
  source: 'anilist-sync',
  category: 'anime',
  title: 'Frieren',
  ids: { anilist: '154587', mal: '52991' },
  status: 'COMPLETED',
  rating: 9,
  progress: 28,
  ...over,
});

const T = new Date('2026-10-20T12:00:00Z');
const before = T.getTime() - 60_000;
const after = T.getTime() + 60_000;

describe('resolveConflict (most recent change wins)', () => {
  it('takes AniList status (forward only), score and progress when AniList is newer', () => {
    const local = { status: 'CONSUMING' as const, rating: 7, progress: 10, updatedAt: T };
    expect(resolveConflict(local, remote(), after)).toEqual({ status: 'COMPLETED', rating: 9, progress: 28 });
  });

  it('never moves the status back, even when AniList is newer', () => {
    const local = { status: 'COMPLETED' as const, rating: 9, progress: 28, updatedAt: T };
    expect(resolveConflict(local, remote({ status: 'PLANNED' }), after)).toEqual({});
  });

  it('treats statuses AniList stores alike as equal (Retired pushed as Completed)', () => {
    const local = { status: 'RETIRED' as const, rating: 9, progress: 28, updatedAt: T };
    expect(resolveConflict(local, remote({ status: 'COMPLETED' }), after)).toEqual({});
  });

  it('keeps Hoard when Hoard changed it last, filling only blanks', () => {
    const local = { status: 'CONSUMING' as const, rating: 7, progress: null, updatedAt: T };
    expect(resolveConflict(local, remote(), before)).toEqual({ progress: 28 });
    const blank = { status: 'PLANNED' as const, rating: null, progress: null, updatedAt: T };
    expect(resolveConflict(blank, remote(), before)).toEqual({ rating: 9, progress: 28 });
  });

  it('treats an unknown AniList time as older', () => {
    const local = { status: 'CONSUMING' as const, rating: 7, progress: 3, updatedAt: T };
    expect(resolveConflict(local, remote(), null)).toEqual({});
  });

  it('never clears a score or progress AniList does not have', () => {
    const local = { status: 'CONSUMING' as const, rating: 7, progress: 3, updatedAt: T };
    expect(resolveConflict(local, remote({ rating: undefined, progress: undefined, status: 'CONSUMING' }), after)).toEqual({});
  });
});

describe('pulledEntries', () => {
  it('keeps status lists only, one per media, with updatedAt in ms', () => {
    const entries = pulledEntries(
      [
        {
          lists: [
            { name: 'Favs', isCustomList: true, entries: [{ status: 'CURRENT', media: { id: 2, title: { romaji: 'B' } } }] },
            {
              name: 'Completed',
              isCustomList: false,
              entries: [
                { status: 'COMPLETED', score: 8.5, updatedAt: 1_700_000_000, media: { id: 1, idMal: 5, title: { english: 'A' } } },
                { status: 'COMPLETED', media: { id: 1, title: { english: 'A again' } } },
              ],
            },
          ],
        },
      ],
      'ANIME',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ mediaId: 1, updatedAt: 1_700_000_000_000 });
    expect(entries[0].row).toMatchObject({ source: 'anilist-sync', title: 'A', rating: 8.5, ids: { anilist: '1', mal: '5' } });
    expect(catalogueKeys(entries[0].row)).toEqual(['5', 'al-1']);
  });
});

describe('push', () => {
  it('maps statuses', () => {
    expect(toAniListStatus('PLANNED')).toBe('PLANNING');
    expect(toAniListStatus('CONSUMING')).toBe('CURRENT');
    expect(toAniListStatus('CONSUMING', true)).toBe('REPEATING');
    expect(toAniListStatus('ON_HOLD')).toBe('PAUSED');
    expect(toAniListStatus('RETIRED')).toBe('COMPLETED');
    expect(toAniListStatus('DROPPED')).toBe('DROPPED');
  });

  it('sends a 0–100 raw score and progress', () => {
    expect(pushVariables(7, { status: 'COMPLETED', rating: 8.5, progress: 12 })).toEqual({
      mediaId: 7,
      status: 'COMPLETED',
      scoreRaw: 85,
      progress: 12,
    });
    expect(pushVariables(7, { status: 'PLANNED', rating: null, progress: null })).toEqual({
      mediaId: 7,
      status: 'PLANNING',
      scoreRaw: 0,
    });
  });

  it('reads the AniList id behind a catalogue key', () => {
    expect(aniListIdFromKey('al-154587')).toEqual({ al: 154587 });
    expect(aniListIdFromKey('52991')).toEqual({ mal: 52991 });
    expect(aniListIdFromKey('manual:x')).toBeNull();
  });

  it('builds the authorize URL', () => {
    const url = new URL(authorizeUrl('42', 'https://h.example/api/oauth/anilist', 'st'));
    expect(url.origin + url.pathname).toBe('https://anilist.co/api/v2/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: '42',
      redirect_uri: 'https://h.example/api/oauth/anilist',
      response_type: 'code',
      state: 'st',
    });
  });
});

describe('importPushTargets', () => {
  const rows = [
    { category: 'anime', source: 'mal' },
    { category: 'manga', source: 'hoard' },
    { category: 'anime', source: 'anilist-sync' },
    { category: 'anime', source: 'anilist' },
    { category: 'movies', source: 'letterboxd' },
    { category: 'anime', source: 'mal' },
    { category: 'anime', source: 'mal' },
  ];
  const outcomes = [
    { outcome: 'added', activityId: 'a' },
    { outcome: 'updated', activityId: 'b' },
    { outcome: 'updated', activityId: 'c' },
    { outcome: 'added', activityId: 'd' },
    { outcome: 'added', activityId: 'e' },
    { outcome: 'unchanged', activityId: 'f' },
    { outcome: 'failed' },
  ];

  it('pushes added and updated anime / manga, never rows that came from AniList', () => {
    expect(importPushTargets(rows, outcomes, 7)).toEqual({
      targets: [
        { activityId: 'a', category: 'ANIME' },
        { activityId: 'b', category: 'MANGA' },
      ],
      skippedLarge: false,
    });
  });

  it('pushes nothing from an import of more than 200 rows (or of unknown size)', () => {
    expect(importPushTargets(rows, outcomes, MAX_IMPORT_PUSH_ROWS)).toMatchObject({ skippedLarge: false });
    expect(importPushTargets(rows, outcomes, MAX_IMPORT_PUSH_ROWS + 1)).toEqual({ targets: [], skippedLarge: true });
    expect(importPushTargets(rows, outcomes, undefined)).toEqual({ targets: [], skippedLarge: true });
  });

  it('does not report a skip when nothing would have been pushed', () => {
    expect(importPushTargets([{ category: 'anime', source: 'anilist' }], [{ outcome: 'added', activityId: 'x' }], 5000)).toEqual({
      targets: [],
      skippedLarge: false,
    });
  });
});

describe('sameAniListName', () => {
  it('ignores case and spaces around', () => {
    expect(sameAniListName('Tim', ' tim ')).toBe(true);
    expect(sameAniListName('Tim', 'Tom')).toBe(false);
  });
});
