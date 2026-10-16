// ───────────────────────────────────────────────────────────────────────────
//  OpenLibrary provider — books. No API key required.
//  Server-only. fetch with { cache: 'no-store' }.
// ───────────────────────────────────────────────────────────────────────────

import type { NormalizedResult } from '@/lib/types';

const OPENLIBRARY_SEARCH = 'https://openlibrary.org/search.json';

interface OpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[] | null;
  first_publish_year?: number | null;
  cover_i?: number | null;
  number_of_pages_median?: number | null;
  isbn?: string[] | null;
}

interface OpenLibraryResponse {
  docs?: OpenLibraryDoc[];
}

export async function searchBooks(query: string): Promise<NormalizedResult[]> {
  const q = query.trim();
  if (!q) return [];

  const fields = 'key,title,author_name,first_publish_year,cover_i,number_of_pages_median,isbn';
  const url = `${OPENLIBRARY_SEARCH}?limit=20&fields=${fields}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`OpenLibrary search failed (${res.status})`);

  const json = (await res.json()) as OpenLibraryResponse;
  const docs = json.docs ?? [];

  return docs.map((d): NormalizedResult => {
    const image = d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null;
    const year = d.first_publish_year ?? null;
    const authors = d.author_name ?? [];
    const pageCount = d.number_of_pages_median ?? null;
    const isbn = d.isbn?.[0] ?? null;

    const subtitleParts: string[] = [];
    if (authors.length) subtitleParts.push(authors.join(', '));
    if (year) subtitleParts.push(String(year));

    return {
      externalId: d.key,
      title: d.title,
      imageUrl: image,
      subtitle: subtitleParts.length ? subtitleParts.join(' · ') : null,
      year,
      description: null,
      // EXACTLY the Book table columns (+ externalId + title).
      fields: {
        externalId: d.key,
        title: d.title,
        imageUrl: image,
        description: null,
        year,
        authors,
        pageCount,
        isbn,
      },
    };
  });
}
