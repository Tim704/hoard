// Settings → Data (spec 1.11): download the library, the franchises or
// everything as files (plain links to the session-checked /api/export/*
// routes), and the way in: a link to /import (2.1).

import Link from 'next/link';
import { Download, Upload } from 'lucide-react';

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
    href: '/api/export/markdown.zip',
    label: 'Markdown (Obsidian)',
    hint: 'One note per title, in a folder per section: status, score, tier, dates and tags up top, then your notes and reviews.',
  },
  {
    href: '/api/export/all.json',
    label: 'Everything (JSON)',
    hint: 'Your whole library, history, diary, lists, goals and settings — a complete copy of your data.',
  },
];

export function SettingsData() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Data</CardTitle>
        <CardDescription>
          Download your data (CSV files open in Excel, Numbers or Google Sheets), or bring lists in from elsewhere.
        </CardDescription>
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
        <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground sm:pr-4">
            Import from a Hoard CSV, AniList, Letterboxd, Goodreads or StoryGraph.
          </p>
          <Link
            href="/import"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0 self-start sm:self-auto')}
          >
            <Upload className="mr-2 h-4 w-4" aria-hidden />
            Import
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
