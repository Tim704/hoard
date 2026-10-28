import { ImportClient } from '@/components/import/import-client';
import { steamConfigured } from '@/lib/apis/steam';
import { tmdbConfigured } from '@/lib/apis/tmdb';
import { getLink } from '@/lib/external-links';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Import · Hoard' };

// The import page (spec 2.1–2.3, 2.7, 2.8). Files are parsed in the browser; matching
// and saving go through the import server actions, a few rows per call.
export default async function ImportPage({ searchParams }: { searchParams: { source?: string } }) {
  const user = await requireUser();
  const steamLink = await getLink(user.id, 'steam');
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Import</h1>
        <p className="text-sm text-muted-foreground">
          Bring your lists over from another site. You check every match before anything is added.
        </p>
      </header>
      <ImportClient
        steamConfigured={steamConfigured()}
        steamLinked={steamLink !== null}
        autoStart={searchParams.source === 'steam' ? 'steam' : null}
        tmdbConfigured={tmdbConfigured()}
        traktConfigured={Boolean(process.env.TRAKT_CLIENT_ID)}
        aiConfigured={Boolean(process.env.GEMINI_API_KEY)}
      />
    </div>
  );
}
