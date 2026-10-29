import { AddByLink } from '@/components/add-by-link';
import { sharedInput } from '@/lib/links';

export const metadata = { title: 'Add · Hoard' };

// Add by link (spec 2.4), also the PWA share target (1.7): Android's share
// sheet opens /add?title=…&text=…&url=… (the link is as often inside `text`).
// A recognised link becomes one add row; anything else falls back to Search
// everything with the best title guess.

interface AddPageProps {
  searchParams: { title?: string | string[]; text?: string | string[]; url?: string | string[] };
}

/** One query value, trimmed and capped. */
function param(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? '').trim().slice(0, 2000);
}

export default function AddPage({ searchParams }: AddPageProps) {
  const title = param(searchParams.title).slice(0, 200);
  const { url, guess } = sharedInput({
    url: param(searchParams.url),
    text: param(searchParams.text),
    title,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-[var(--page-pad)] py-6 sm:py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Add to Hoard</h1>
        <p className="text-sm text-muted-foreground">
          Paste a link from TMDB, IMDb, AniList, MyAnimeList, IGDB, Steam, Goodreads, Letterboxd or
          OpenLibrary, or search every section at once.
        </p>
      </header>
      {/* Keyed so a new shared link starts over. */}
      <AddByLink key={`${url ?? ''}|${guess}`} url={url} guess={guess} sharedTitle={title} />
    </div>
  );
}
