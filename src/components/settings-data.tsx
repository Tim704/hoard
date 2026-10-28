// Settings → Data (spec 1.11): download the library, the franchises or
// everything as files. Plain links to the session-checked /api/export/* routes.

import { Download } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const DOWNLOADS = [
  {
    href: '/api/export/library.csv',
    label: 'Library (CSV)',
    hint: 'Every title in every section: status, score, tier, dates, progress, franchise and notes.',
  },
  { href: '/api/export/franchises.csv', label: 'Franchises (CSV)', hint: 'Each franchise with its score and titles.' },
  {
    href: '/api/export/all.json',
    label: 'Everything (JSON)',
    hint: 'Your whole library, history, franchises and settings — a complete copy of your data.',
  },
];

export function SettingsData() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Data</CardTitle>
        <CardDescription>Download your data. CSV files open in Excel, Numbers or Google Sheets.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {DOWNLOADS.map((d) => (
          <div key={d.href} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground sm:pr-4">{d.hint}</p>
            <a
              href={d.href}
              download
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0 self-start sm:self-auto')}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden />
              {d.label}
            </a>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
