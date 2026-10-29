import { describe, expect, it } from 'vitest';

import { pickCardBadge } from './card-badge';
import { makeActivity } from './test-fixtures';
import type { ActivityWithMedia } from './types';

const TODAY = '2026-10-29';

/** A title that qualifies for every badge at once (as far as one can). */
function everything(overrides: Partial<ActivityWithMedia> = {}): ActivityWithMedia {
  return makeActivity({
    id: 'x',
    category: 'tv',
    status: 'PLANNED',
    newSeason: 3,
    listenSuggested: true,
    progress: 4,
    media: {
      id: 'm',
      externalId: 'e',
      title: 'X',
      imageUrl: null,
      description: null,
      year: 2026,
      releaseDate: '2026-11-08',
      episodeCount: 10,
      timeToBeatHours: 32,
    },
    ...overrides,
  });
}

const kind = (a: ActivityWithMedia, today: string | null = TODAY) => pickCardBadge(a, today)?.kind ?? null;

describe('pickCardBadge', () => {
  it('picks the new season first', () => {
    expect(pickCardBadge(everything(), TODAY)).toEqual({
      kind: 'new-season',
      label: 'New season',
      title: 'Season 3 is out',
    });
  });

  it('then the countdown of a Planned title', () => {
    expect(pickCardBadge(everything({ newSeason: null }), TODAY)).toEqual({
      kind: 'countdown',
      label: 'in 10 days',
      title: 'Out in 10 days',
    });
  });

  it('skips the countdown before today is known, on release day, and when not Planned', () => {
    const music = { category: 'music' as const, newSeason: null };
    expect(kind(everything(music), null)).toBe('listen');
    expect(kind(everything({ ...music, media: { ...everything().media, releaseDate: TODAY } }))).toBe('listen');
    expect(kind(everything({ ...music, status: 'CONSUMING' }))).toBe('listen');
  });

  it('then "Mark as Listened?" (Planned or in progress)', () => {
    const music = everything({ category: 'music', newSeason: null, status: 'CONSUMING' });
    expect(pickCardBadge(music, TODAY)?.label).toBe('Mark as Listened?');
    // Finished: no listen badge, so progress isn't shown either (not ongoing).
    expect(kind({ ...music, status: 'COMPLETED' })).toBeNull();
  });

  it('then progress while ongoing, with the share done when the total is known', () => {
    const tv = everything({ newSeason: null, listenSuggested: false, status: 'CONSUMING' });
    expect(pickCardBadge(tv, TODAY)).toEqual({
      kind: 'progress',
      label: '4 / 10 episodes',
      title: 'Progress: 4 / 10 episodes',
      fraction: 0.4,
    });
    const unknownTotal = { ...tv, media: { ...tv.media, episodeCount: null } };
    expect(pickCardBadge(unknownTotal, TODAY)).toMatchObject({ label: '4 episodes', fraction: null });
  });

  it('shows no progress without a stored count, or for a section that does not count it', () => {
    expect(kind(everything({ newSeason: null, listenSuggested: false, status: 'CONSUMING', progress: null }))).toBeNull();
    expect(kind(everything({ category: 'movies', newSeason: null, listenSuggested: false, status: 'CONSUMING' }))).toBeNull();
  });

  it('then a game’s time to beat', () => {
    const game = everything({ category: 'games', newSeason: null, listenSuggested: false, status: 'CONSUMING' });
    expect(pickCardBadge(game, TODAY)).toEqual({ kind: 'time-to-beat', label: '≈ 32 h', title: 'Time to beat: ≈ 32 h' });
    // A Planned game coming out still shows its countdown first.
    expect(kind({ ...game, status: 'PLANNED' })).toBe('countdown');
    // Only games have one.
    expect(kind(everything({ category: 'books', newSeason: null, listenSuggested: false, status: 'COMPLETED' }))).toBeNull();
    expect(kind({ ...game, media: { ...game.media, timeToBeatHours: 0 } })).toBeNull();
    expect(kind({ ...game, media: { ...game.media, timeToBeatHours: '32' } })).toBeNull();
  });

  it('is null for a plain finished title', () => {
    expect(kind(makeActivity({ id: 'plain' }))).toBeNull();
  });
});
