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
    // Phones: five equal tabs that fit the gutter; from sm, a strip sized to its tabs.
    <nav aria-label="Stats" className="mb-6">
      <ul className="grid grid-cols-5 gap-1 rounded-lg border border-border bg-muted/40 p-1 sm:flex sm:w-max">
        {tabs.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={t.key === active ? 'page' : undefined}
              className={cn(
                'block rounded-md px-1 py-2.5 text-center text-sm font-medium transition-colors sm:px-3 sm:py-1.5',
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
