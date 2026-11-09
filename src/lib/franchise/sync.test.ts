// Grouping never moves a title placed by hand, and a title placed by hand
// never drags the titles it used to be grouped with into its new franchise.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const activities: Row[] = [];
const franchises: Row[] = [];
let nextId = 0;

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userMediaActivity: {
      findMany: async () => activities.map((a) => ({ ...a })),
      updateMany: async ({ where, data }: any) => {
        const hits = activities.filter((a) => where.id.in.includes(a.id));
        hits.forEach((a) => Object.assign(a, data));
        return { count: hits.length };
      },
    },
    franchise: {
      findUnique: async ({ where }: any) => franchises.find((f) => f.matchName === where.userId_matchName.matchName) ?? null,
      create: async ({ data }: any) => {
        const row = { id: `new${++nextId}`, ...data };
        franchises.push(row);
        return { id: row.id };
      },
    },
  },
}));

const { syncUserFranchises } = await import('./sync');

const anime = (title: string, franchiseKey: string | null) => ({
  title,
  imageUrl: null,
  year: 2010,
  franchiseKey,
  franchiseName: null,
});

function title(id: string, media: Row, extra: Row = {}): Row {
  return { id, franchiseId: null, franchiseLocked: false, anime: media, ...extra };
}

beforeEach(() => {
  activities.length = franchises.length = 0;
  nextId = 0;
});

describe('syncUserFranchises', () => {
  it('a title moved into its own franchise by hand does not pull its old group along', () => {
    franchises.push({ id: 'fate', matchName: 'fate' }, { id: 'apo', matchName: 'apocrypha' });
    activities.push(
      title('zero', anime('Fate/Zero', 'anilist:1'), { franchiseId: 'fate' }),
      title('sn', anime('Fate/stay night', 'anilist:1'), { franchiseId: 'fate' }),
      title('apo1', anime('Fate/Apocrypha', 'anilist:1'), { franchiseId: 'apo', franchiseLocked: true }),
    );
    return syncUserFranchises('u1').then(() => {
      expect(activities.find((a) => a.id === 'zero')?.franchiseId).toBe('fate');
      expect(activities.find((a) => a.id === 'sn')?.franchiseId).toBe('fate');
      expect(activities.find((a) => a.id === 'apo1')?.franchiseId).toBe('apo');
    });
  });

  it('still groups unlocked titles that share a key, and keeps a hand-placed title where it is', async () => {
    activities.push(
      title('a', anime('Mushishi', 'anilist:9')),
      title('b', anime('Mushishi Zoku Shou', 'anilist:9')),
      title('c', anime('Other', 'anilist:9'), { franchiseId: 'mine', franchiseLocked: true }),
    );
    await syncUserFranchises('u1');
    const a = activities.find((x) => x.id === 'a')?.franchiseId;
    expect(a).toBeTruthy();
    expect(a).not.toBe('mine');
    expect(activities.find((x) => x.id === 'b')?.franchiseId).toBe(a);
    expect(activities.find((x) => x.id === 'c')?.franchiseId).toBe('mine');
  });
});
