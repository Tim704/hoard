'use client';

import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';

import { useGlobalSearch } from '@/components/global-search';
import { Button } from '@/components/ui/button';

/** A brand-new account's dashboard: the two ways in, before the (empty) tiles. */
export function WelcomeCard() {
  const { openSearch } = useGlobalSearch();
  return (
    <section aria-labelledby="welcome" className="mb-6 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-6">
      <div className="space-y-1">
        <h2 id="welcome" className="text-lg font-semibold">
          Your hoard is empty
        </h2>
        <p className="text-sm text-muted-foreground">
          Add what you’re reading, watching or playing, or bring your lists over from another site.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => openSearch('')}>
          <Plus className="h-4 w-4" aria-hidden />
          Add a title
        </Button>
        <Button asChild variant="outline">
          <Link href="/import">
            <Upload className="h-4 w-4" aria-hidden />
            Import from another site
          </Link>
        </Button>
      </div>
    </section>
  );
}
