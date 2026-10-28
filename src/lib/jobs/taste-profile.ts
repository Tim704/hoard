// The `taste-profile` job (spec 7.2 / F3, Sundays 05:45 server time): rebuild
// each user's taste profile when they have finished at least 5 titles. Every
// such user is recomputed (removals, hidden sections and new metadata count);
// the write is skipped when the result equals the stored profile.

import { prisma } from '@/lib/prisma';
import { refreshTasteProfileForJob } from '@/lib/data-taste';

export async function runTasteProfiles(): Promise<{ built: number; unchanged: number; tooFew: number }> {
  const users = await prisma.user.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } });
  const tally = { built: 0, unchanged: 0, tooFew: 0 };
  for (const { id } of users) {
    try {
      const res = await refreshTasteProfileForJob(id);
      if (res === 'built') tally.built += 1;
      else if (res === 'unchanged') tally.unchanged += 1;
      else tally.tooFew += 1;
    } catch (err) {
      // One user's bad row must not stop everyone else's profile.
      console.error('[taste-profile] failed for a user:', err instanceof Error ? err.message : err);
    }
  }
  return tally;
}
