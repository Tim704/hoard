import Link from 'next/link';

import { cn } from '@/lib/utils';

export type StatsTab = 'overview' | 'year' | 'goals' | 'taste' | 'people';

/**
 * The /stats tab bar (spec 6.x). Tabs are plain links (query-param tabs on
 * /stats; the Year tab is /stats/year/[year]), so every view has a URL.
 */
export function StatsTabs({ active, currentYear }: { active: StatsTab; currentYear: number }) {
  const tabs: { key: StatsTab; label: string; href: string }[] = [
    { key: 'overview', label: 'Overview', href: '/stats' },
    { key: 'year', label: 'Year', href: `/stats/year/${currentYear}` },
    { key: 'goals', label: 'Goals', href: '/stats?tab=goals' },
    { key: 'taste', label: 'Taste', href: '/stats?tab=taste' },
    { key: 'people', label: 'People', href: '/stats?tab=people' },
  ];
  return (
    <nav aria-label="Stats" className="scrollbar-thin -mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {tabs.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={t.key === active ? 'page' : undefined}
              className={cn(
                'block rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                t.key === active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
