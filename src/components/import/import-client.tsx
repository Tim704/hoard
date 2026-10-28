'use client';

// /import (spec 2.1–2.3): pick a source, give it a file or a username, and
// the rows go to the review screen. Files are read and parsed here in the
// browser; only the parsed rows go to the server, 10 at a time.

import { useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, FileUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { ImportReview } from '@/components/import/import-review';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchAniListRows } from '@/lib/actions/import';
import { sanitizeRow, type ParseResult } from '@/lib/import/rows';
import { validAniListUser } from '@/lib/import/sources/anilist';
import { parseGoodreads } from '@/lib/import/sources/goodreads';
import { parseHoardCsv } from '@/lib/import/sources/hoard';
import { parseLetterboxd, readLetterboxdZip, type NamedText } from '@/lib/import/sources/letterboxd';
import { parseStoryGraph } from '@/lib/import/sources/storygraph';
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS, type ImportRow, type ImportSource } from '@/lib/import/types';

interface SourceInfo {
  id: ImportSource;
  name: string;
  what: string;
  /** How to get the export, step by step. */
  how: string[];
  /** File input `accept`, or null for a username source. */
  accept: string | null;
  multiple?: boolean;
}

const SOURCES: SourceInfo[] = [
  {
    id: 'hoard',
    name: 'Hoard CSV',
    what: 'A library.csv exported from Hoard (this account or another one).',
    how: ['Settings → Data → Library (CSV).'],
    accept: '.csv,text/csv',
  },
  {
    id: 'anilist',
    name: 'AniList',
    what: 'Your anime and manga lists, scores, progress and dates.',
    how: ['Type your AniList username. The profile must be public (AniList → Settings → Account).'],
    accept: null,
  },
  {
    id: 'letterboxd',
    name: 'Letterboxd',
    what: 'Watched films, ratings, your diary and your watchlist.',
    how: [
      'letterboxd.com → Settings → Data → Export your data.',
      'Upload the .zip as it is, or any of watched.csv, ratings.csv, diary.csv, reviews.csv and watchlist.csv.',
    ],
    accept: '.zip,.csv,application/zip,text/csv',
    multiple: true,
  },
  {
    id: 'goodreads',
    name: 'Goodreads',
    what: 'Your shelves, ratings and read dates.',
    how: ['goodreads.com → My Books → Import and export → Export Library, then download the CSV.'],
    accept: '.csv,text/csv',
  },
  {
    id: 'storygraph',
    name: 'StoryGraph',
    what: 'Your read statuses, star ratings, dates and tags.',
    how: ['app.thestorygraph.com → Manage account → Export StoryGraph library, then download the CSV.'],
    accept: '.csv,text/csv',
  },
];

/** Parse one source's files into rows. Throws a readable message on bad input. */
async function parseFiles(source: ImportSource, files: File[]): Promise<ParseResult> {
  for (const f of files) {
    if (f.size > MAX_IMPORT_FILE_BYTES) throw new Error(`${f.name} is larger than 20 MB.`);
  }
  if (source === 'letterboxd') {
    const texts: NamedText[] = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        try {
          texts.push(...readLetterboxdZip(new Uint8Array(await f.arrayBuffer())));
        } catch {
          throw new Error(`${f.name} could not be opened as a zip file.`);
        }
      } else {
        texts.push({ name: f.name, text: await f.text() });
      }
    }
    if (texts.length === 0) throw new Error('No Letterboxd CSV files were found in that zip.');
    return parseLetterboxd(texts);
  }
  const text = await files[0].text();
  if (source === 'hoard') return parseHoardCsv(text);
  if (source === 'goodreads') return parseGoodreads(text);
  return parseStoryGraph(text);
}

export function ImportClient({ tmdbConfigured }: { tmdbConfigured: boolean }) {
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [runId, setRunId] = useState(0);
  const [busy, setBusy] = useState<ImportSource | null>(null);
  const [finished, setFinished] = useState(false);

  function start(result: ParseResult, sourceName: string) {
    for (const w of result.warnings) toast.warning(w);
    if (result.rows.length === 0) {
      toast.error(`No titles found in that ${sourceName} export.`);
      return;
    }
    let list = result.rows.map(sanitizeRow);
    if (list.length > MAX_IMPORT_ROWS) {
      toast.warning(`Only the first ${MAX_IMPORT_ROWS} titles are imported at once. Import the file again for the rest.`);
      list = list.slice(0, MAX_IMPORT_ROWS);
    }
    if (result.skipped > 0) toast.message(`${result.skipped} line${result.skipped === 1 ? '' : 's'} had no usable title and were skipped.`);
    setFinished(false);
    setRows(list);
    setRunId((n) => n + 1);
  }

  async function onFiles(source: SourceInfo, files: File[]) {
    if (files.length === 0) return;
    setBusy(source.id);
    try {
      start(await parseFiles(source.id, files), source.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That file could not be read.');
    } finally {
      setBusy(null);
    }
  }

  async function onAniList(username: string) {
    if (!validAniListUser(username)) {
      toast.error('That is not an AniList username.');
      return;
    }
    setBusy('anilist');
    try {
      const res = await fetchAniListRows(username);
      if (!res.ok || !res.rows) toast.error(res.error ?? 'Could not read that AniList profile.');
      else start({ rows: res.rows, skipped: res.skipped ?? 0, warnings: [] }, 'AniList');
    } finally {
      setBusy(null);
    }
  }

  if (rows) {
    return (
      <div className="space-y-4">
        {finished && (
          <Button type="button" variant="outline" size="sm" onClick={() => setRows(null)}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
            Import something else
          </Button>
        )}
        <ImportReview
          key={runId}
          rows={rows}
          onDone={(summary) => (summary ? setFinished(true) : setRows(null))}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {SOURCES.map((s) => (
        <Card key={s.id} className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{s.name}</CardTitle>
            <CardDescription>{s.what}</CardDescription>
          </CardHeader>
          <CardContent className="mt-auto space-y-3">
            <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              {s.how.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            {s.id === 'letterboxd' && !tmdbConfigured && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                TMDB isn&apos;t configured on this server, so films can&apos;t be matched yet.
              </p>
            )}
            {s.accept ? (
              <FilePick source={s} busy={busy === s.id} disabled={busy !== null} onFiles={(f) => void onFiles(s, f)} />
            ) : (
              <AniListForm busy={busy === 'anilist'} disabled={busy !== null} onSubmit={(u) => void onAniList(u)} />
            )}
          </CardContent>
        </Card>
      ))}
      <Card className="border-dashed md:col-span-2">
        <CardContent className="py-4 text-sm text-muted-foreground">
          More sources are on the way: MyAnimeList, Trakt and any other CSV.
        </CardContent>
      </Card>
    </div>
  );
}

function FilePick({
  source,
  busy,
  disabled,
  onFiles,
}: {
  source: SourceInfo;
  busy: boolean;
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        className="sr-only"
        accept={source.accept ?? undefined}
        multiple={source.multiple}
        aria-label={`${source.name} export file`}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <FileUp className="mr-2 h-4 w-4" aria-hidden />}
        {source.multiple ? 'Choose files' : 'Choose file'}
      </Button>
    </>
  );
}

function AniListForm({
  busy,
  disabled,
  onSubmit,
}: {
  busy: boolean;
  disabled: boolean;
  onSubmit: (username: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(name.trim());
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="AniList username"
        aria-label="AniList username"
        autoComplete="off"
        className="h-9"
        disabled={disabled}
      />
      <Button type="submit" size="sm" className="h-9" disabled={disabled || name.trim() === ''}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
        Fetch
      </Button>
    </form>
  );
}
