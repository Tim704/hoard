import Link from 'next/link';
import { Share2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CATEGORIES, NAV_ORDER } from '@/lib/categories';
import { getCurrentPrefs } from '@/lib/data-prefs';

export const metadata = { title: 'Add · Hoard' };

// The PWA share target (spec 1.7): Android's share sheet opens
// /add?title=…&text=…&url=…. Until the "add from a link" flow (2.4) replaces
// this page, it shows what was shared and links to the sections, where the
// title can be searched for and added.

interface AddPageProps {
  searchParams: { title?: string | string[]; text?: string | string[]; url?: string | string[] };
}

/** One query value, trimmed and capped (it is only ever displayed as text). */
function param(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? '').trim().slice(0, 500);
}

/** Only http(s) links are shown as links; anything else stays plain text. */
function safeHref(u: string): string | null {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function AddPage({ searchParams }: AddPageProps) {
  const prefs = await getCurrentPrefs();
  const title = param(searchParams.title);
  const text = param(searchParams.text);
  const url = param(searchParams.url);
  const href = url ? safeHref(url) : null;
  const shared = Boolean(title || text || url);
  const sections = NAV_ORDER.filter((s) => !prefs.hiddenSections.includes(s));

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Add to Hoard</h1>
        <p className="text-sm text-muted-foreground">
          Pick the section it belongs in, then use its Add button to search for it.
        </p>
      </header>

      {shared && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Share2 className="h-4 w-4 text-muted-foreground" aria-hidden />
              You shared
            </CardTitle>
            <CardDescription>Adding straight from a link is coming in a later update.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 break-words text-sm">
            {title && <p className="font-medium">{title}</p>}
            {text && text !== url && <p className="text-muted-foreground">{text}</p>}
            {url &&
              (href ? (
                <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline-offset-2 hover:underline">
                  {url}
                </a>
              ) : (
                <p className="text-muted-foreground">{url}</p>
              ))}
          </CardContent>
        </Card>
      )}

      <nav aria-label="Sections" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {sections.map((slug) => (
          <Link
            key={slug}
            href={`/${slug}`}
            className="rounded-lg border border-border px-3 py-3 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-accent/40"
          >
            {CATEGORIES[slug].label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
