import { Popcorn } from 'lucide-react';

import { TonightClient } from '@/components/tonight-client';
import { getTonightQueues } from '@/lib/data-tonight';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Tonight · Hoard' };

/** The tonight picker (5.2): three picks from your Up next queues that fit the time you have. */
export default async function TonightPage() {
  await requireUser();
  const { queues, sections } = await getTonightQueues();
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-[var(--page-pad)] py-4 sm:py-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Popcorn className="h-6 w-6 text-amber-500" aria-hidden />
          What tonight?
        </h1>
        <p className="text-sm text-muted-foreground">
          Three picks from your Up next queues, top of the queue first. Only titles that are already out.
        </p>
      </header>
      <TonightClient queues={queues} sections={sections} />
    </div>
  );
}
