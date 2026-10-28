import { describe, expect, it } from 'vitest';

import type { Status } from '@/lib/status';

import { earlierUnfinished, nextInFranchise, orderFranchiseMembers, type OrderMember } from './order';

const m = (
  id: string,
  status: Status,
  year: number | null,
  releaseDate: string | null = null,
  franchiseOrder: number | null = null,
): OrderMember => ({ id, status, franchiseOrder, media: { title: id, year, releaseDate } });

describe('orderFranchiseMembers', () => {
  const s1 = m('S1', 'COMPLETED', 2014, '2014-04-06');
  const movie = m('Movie', 'PLANNED', 2014, '2014-01-01');
  const s2 = m('S2', 'PLANNED', 2015, '2015-10-04');
  const s3 = m('S3', 'PLANNED', 2016, null);
  const unknown = m('Zzz', 'PLANNED', null);

  it('release: date, then year, unknowns last', () => {
    const order = orderFranchiseMembers([unknown, s3, s2, s1, movie], 'release').map((x) => x.id);
    expect(order).toEqual(['Movie', 'S1', 'S2', 'S3', 'Zzz']);
  });
  it('a year-only title sorts after full dates of the same year', () => {
    const y = m('Y', 'PLANNED', 2014);
    expect(orderFranchiseMembers([y, s1], 'release').map((x) => x.id)).toEqual(['S1', 'Y']);
  });
  it('manual: drag order first, unplaced titles after in release order', () => {
    const a = { ...s2, franchiseOrder: 1000 };
    const b = { ...s1, franchiseOrder: 2000 };
    const order = orderFranchiseMembers([b, movie, a, s3], 'manual').map((x) => x.id);
    expect(order).toEqual(['S2', 'S1', 'Movie', 'S3']);
  });
  it('unknown modes fall back to release', () => {
    expect(orderFranchiseMembers([s2, s1], 'nonsense').map((x) => x.id)).toEqual(['S1', 'S2']);
  });
  it('does not mutate its input', () => {
    const input = [s2, s1];
    orderFranchiseMembers(input, 'release');
    expect(input.map((x) => x.id)).toEqual(['S2', 'S1']);
  });
});

describe('nextInFranchise', () => {
  it('is the first title not finished, retired or dropped', () => {
    const ordered = [m('a', 'COMPLETED', 1), m('b', 'DROPPED', 2), m('c', 'ON_HOLD', 3), m('d', 'PLANNED', 4)];
    expect(nextInFranchise(ordered)?.id).toBe('c');
  });
  it('is null when everything is settled', () => {
    expect(nextInFranchise([m('a', 'COMPLETED', 1), m('b', 'RETIRED', 2)])).toBeNull();
    expect(nextInFranchise([])).toBeNull();
  });
});

describe('earlierUnfinished across sections', () => {
  const x = (id: string, category: string, status: Status, queueOrder: number | null = null): OrderMember => ({
    id,
    status,
    category,
    queueOrder,
    media: { title: id, year: null },
  });
  const anime = x('anime', 'anime', 'PLANNED', 1000);
  it('an unread manga that was never queued does not hold up a queued anime', () => {
    expect(earlierUnfinished([x('manga', 'manga', 'PLANNED'), anime], 'anime')).toEqual([]);
  });
  it('a manga in progress, on hold or queued does', () => {
    for (const m of [x('m', 'manga', 'CONSUMING'), x('m', 'manga', 'ON_HOLD'), x('m', 'manga', 'PLANNED', 2000)]) {
      expect(earlierUnfinished([m, anime], 'anime').map((e) => e.id)).toEqual(['m']);
    }
  });
  it('a settled title of another section never does', () => {
    expect(earlierUnfinished([x('m', 'manga', 'COMPLETED'), x('d', 'manga', 'DROPPED'), anime], 'anime')).toEqual([]);
  });
  it('the same section always counts, queued or not', () => {
    expect(earlierUnfinished([x('s1', 'anime', 'PLANNED'), anime], 'anime').map((e) => e.id)).toEqual(['s1']);
  });
});

describe('earlierUnfinished', () => {
  const ordered = [m('s1', 'COMPLETED', 1), m('s2', 'CONSUMING', 2), m('s3', 'PLANNED', 3), m('s4', 'PLANNED', 4)];
  it('lists unsettled titles before the given one', () => {
    expect(earlierUnfinished(ordered, 's4').map((x) => x.id)).toEqual(['s2', 's3']);
    expect(earlierUnfinished(ordered, 's3').map((x) => x.id)).toEqual(['s2']);
  });
  it('is empty for the first title, an all-finished prefix, or a stranger', () => {
    expect(earlierUnfinished(ordered, 's1')).toEqual([]);
    expect(earlierUnfinished(ordered, 's2')).toEqual([]);
    expect(earlierUnfinished(ordered, 'nope')).toEqual([]);
  });
});
