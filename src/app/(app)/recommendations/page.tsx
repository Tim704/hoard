import { Send } from 'lucide-react';

import { CompareOffNotice } from '@/components/compare-parts';
import { RecommendationsClient } from '@/components/recommendations-client';
import { getRecommendationsPage } from '@/lib/data-recommendations';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Recommendations · Hoard' };
export const dynamic = 'force-dynamic';

/** Recommendations between friends: picks sent to you, picks you sent, and how each side's taste landed. */
export default async function RecommendationsPage() {
  const user = await requireUser();
  const page = await getRecommendationsPage(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-[var(--page-pad)] py-4 sm:py-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Send className="h-6 w-6 text-violet-500" aria-hidden />
          Recommendations
        </h1>
        <p className="text-sm text-muted-foreground">Titles you pass along to each other, and how they landed.</p>
      </header>

      {page.ok ? (
        <RecommendationsClient page={page} />
      ) : (
        <CompareOffNotice feature="Recommendations are off for you. They only work" />
      )}
    </div>
  );
}
