// ───────────────────────────────────────────────────────────────────────────
//  Franchise grouping — turn resolved provider keys + normalised titles into
//  per-user Franchise rows. Pure DB work (no network), safe to run often.
//
//  Two of the user's titles end up in the same franchise when they share a
//  provider key (AniList component, TMDB collection, IGDB franchise), a
//  normalised title ("chainsaw man"), or a normalised franchise name. That last
//  link is what joins a TMDB movie to an AniList anime group.
//
//  Rules: no single-title franchises are created; titles the user placed or
//  removed by hand (`franchiseLocked`) are never moved; existing groups are
//  reused, never deleted.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST } from '@/lib/categories';
import { isMatchable, normalizeTitle } from './normalize';

interface MediaCore {
  title: string;
  imageUrl: string | null;
  year: number | null;
  franchiseKey: string | null;
  franchiseName: string | null;
}

interface Node {
  id: string;
  franchiseId: string | null;
  locked: boolean;
  media: MediaCore;
}

/** Tiny union-find over string ids. */
class DisjointSet {
  private parent = new Map<string, string>();
  find(x: string): string {
    let p = this.parent.get(x) ?? x;
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const select = {
  select: { title: true, imageUrl: true, year: true, franchiseKey: true, franchiseName: true },
};

/** Regroup every title of one user into franchises. Returns the group count. */
export async function syncUserFranchises(userId: string): Promise<number> {
  const rows = await prisma.userMediaActivity.findMany({
    where: { userId },
    select: {
      id: true,
      franchiseId: true,
      franchiseLocked: true,
      ...Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, select])),
    } as any,
  });

  const nodes: Node[] = [];
  for (const row of rows as any[]) {
    const cat = CATEGORY_LIST.find((c) => row[c.prismaModel]);
    if (!cat) continue;
    // Removed from a franchise by hand → stays alone.
    if (row.franchiseLocked && !row.franchiseId) continue;
    nodes.push({
      id: row.id,
      franchiseId: row.franchiseId,
      locked: row.franchiseLocked,
      media: row[cat.prismaModel] as MediaCore,
    });
  }

  // Link nodes that share any matching token.
  const ds = new DisjointSet();
  const firstByToken = new Map<string, string>();
  const link = (token: string, id: string) => {
    const seen = firstByToken.get(token);
    if (seen) ds.union(seen, id);
    else firstByToken.set(token, id);
  };
  for (const n of nodes) {
    ds.find(n.id);
    if (n.media.franchiseKey) link(`k:${n.media.franchiseKey}`, n.id);
    if (n.franchiseId) link(`f:${n.franchiseId}`, n.id);
    const t = normalizeTitle(n.media.title);
    if (isMatchable(t)) link(`n:${t}`, n.id);
    if (n.media.franchiseName) {
      const f = normalizeTitle(n.media.franchiseName);
      if (isMatchable(f)) link(`n:${f}`, n.id);
    }
  }

  const groups = new Map<string, Node[]>();
  for (const n of nodes) {
    const root = ds.find(n.id);
    const list = groups.get(root);
    if (list) list.push(n);
    else groups.set(root, [n]);
  }

  let count = 0;
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    count++;
    const franchiseId = await pickOrCreateFranchise(userId, members);
    const toMove = members.filter((m) => !m.locked && m.franchiseId !== franchiseId);
    if (toMove.length > 0) {
      await prisma.userMediaActivity.updateMany({
        where: { id: { in: toMove.map((m) => m.id) }, userId },
        data: { franchiseId },
      });
    }
  }
  return count;
}

/** Most common value in a list (ties → first seen). */
function mode(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [v, n] of counts) if (n > bestN) [best, bestN] = [v, n];
  return best;
}

/** Reuse the group the members already point at, else match by name, else create. */
async function pickOrCreateFranchise(userId: string, members: Node[]): Promise<string> {
  const lockedChoice = mode(members.filter((m) => m.locked && m.franchiseId).map((m) => m.franchiseId as string));
  const existing = lockedChoice ?? mode(members.filter((m) => m.franchiseId).map((m) => m.franchiseId as string));
  if (existing) return existing;

  const name = groupName(members);
  const matchName = normalizeTitle(name) || name.toLowerCase();
  const byName = await prisma.franchise.findUnique({
    where: { userId_matchName: { userId, matchName } },
    select: { id: true },
  });
  if (byName) return byName.id;

  const cover = [...members].sort((a, b) => (a.media.year ?? 9999) - (b.media.year ?? 9999))
    .find((m) => m.media.imageUrl)?.media.imageUrl ?? null;
  const created = await prisma.franchise.create({
    data: { userId, name, matchName, imageUrl: cover },
    select: { id: true },
  });
  return created.id;
}

/** Provider franchise name when one exists, else the shortest member title. */
function groupName(members: Node[]): string {
  const keyed = members.find((m) => m.media.franchiseKey && m.media.franchiseName);
  if (keyed?.media.franchiseName) return keyed.media.franchiseName;
  return [...members]
    .map((m) => m.media.title)
    .sort((a, b) => normalizeTitle(a).length - normalizeTitle(b).length || a.length - b.length)[0];
}
