'use client';

// /import (spec 2.1–2.3, 2.7, 2.8): pick a source, give it a file, a
// username or a pasted list, and the rows go to the review screen. Files are
// read and parsed here in the browser; only the parsed rows go to the
// server, 10 at a time.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ClipboardPaste, Download, FileUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { AiPaste } from '@/components/import/ai-paste';
import { GenericMapper } from '@/components/import/generic-mapper';
import { ImportReview } from '@/components/import/import-review';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchSteamRows } from '@/lib/actions/accounts';
import { fetchAniListRows, fetchTraktRows } from '@/lib/actions/import';
import { csvRecords } from '@/lib/import/csv';
import { sanitizeRow, type ParseResult } from '@/lib/import/rows';
import { validAniListUser } from '@/lib/import/sources/anilist';
import { parseGoodreads } from '@/lib/import/sources/goodreads';
import { parseHoardCsv } from '@/lib/import/sources/hoard';
import { parseLetterboxd, readLetterboxdZip, type NamedText } from '@/lib/import/sources/letterboxd';
import { malExportText, parseMalXml } from '@/lib/import/sources/mal';
import { parseStoryGraph } from '@/lib/import/sources/storygraph';
import { traktUserFromInput, validTraktUser } from '@/lib/import/sources/trakt';
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS, type ImportRow, type ImportSource } from '@/lib/import/types';
import { settingsHref } from '@/lib/settings-nav';

interface SourceInfo {
  id: ImportSource;
  name: string;
  what: string;
  /** How to get the export, step by step. */
  how: string[];
  /** How the source is given: a file, a username, a CSV to map, a pasted list, or a linked account. */
  input: 'file' | 'username' | 'mapped-csv' | 'paste' | 'account';
  /** File input `accept` (file sources). */
  accept?: string;
  multiple?: boolean;
}

/** Sources read in the browser from one or more files. */
type FileSource = 'hoard' | 'letterboxd' | 'goodreads' | 'storygraph' | 'mal';

const SOURCES: SourceInfo[] = [
  {
    id: 'hoard',
    name: 'Hoard CSV',
    what: 'A library.csv exported from Hoard (this account or another one).',
    how: [
      'Settings → Data → Library (CSV).',
      'Brings back statuses, scores, favourites, progress, tags, dates and notes. Tiers, Up next order and franchises are not restored.',
    ],
    input: 'file',
    accept: '.csv,text/csv',
  },
  {
    id: 'anilist',
    name: 'AniList',
    what: 'Your anime and manga lists, scores, progress and dates.',
    how: ['Type your AniList username. The profile must be public (AniList → Settings → Account).'],
    input: 'username',
  },
  {
    id: 'steam',
    name: 'Steam',
    what: 'Every game you own on Steam, with its playtime.',
    how: [
      'Link your Steam account in Settings → Accounts, with your game details set to Public.',
      'Played games are suggested as Playing, the rest as Unplayed. Nothing is marked Beaten.',
    ],
    input: 'account',
  },
  {
    id: 'letterboxd',
    name: 'Letterboxd',
    what: 'Watched films, ratings, your diary and your watchlist.',
    how: [
      'letterboxd.com → Settings → Data → Export your data.',
      'Upload the .zip as it is, or any of watched.csv, ratings.csv, diary.csv, reviews.csv and watchlist.csv.',
    ],
    input: 'file',
    accept: '.zip,.csv,application/zip,text/csv',
    multiple: true,
  },
  {
    id: 'goodreads',
    name: 'Goodreads',
    what: 'Your shelves, ratings and read dates.',
    how: ['goodreads.com → My Books → Import and export → Export Library, then download the CSV.'],
    input: 'file',
    accept: '.csv,text/csv',
  },
  {
    id: 'storygraph',
    name: 'StoryGraph',
    what: 'Your read statuses, star ratings, dates and tags.',
    how: ['app.thestorygraph.com → Manage account → Export StoryGraph library, then download the CSV.'],
    input: 'file',
    accept: '.csv,text/csv',
  },
  {
    id: 'mal',
    name: 'MyAnimeList',
    what: 'Your anime and manga lists, scores, episodes, chapters and dates.',
    how: [
      'myanimelist.net → Profile → Export (or myanimelist.net/panel.php?go=export), once for anime and once for manga.',
      'Upload the .xml.gz files as they are, or the unzipped .xml.',
    ],
    input: 'file',
    accept: '.xml,.gz,application/xml,text/xml,application/gzip',
    multiple: true,
  },
  {
    id: 'trakt',
    name: 'Trakt',
    what: 'Watched movies and shows, ratings and your watchlist.',
    how: ['Type your Trakt username or profile link. The profile must be public (Trakt → Settings → Privacy).'],
    input: 'username',
  },
  {
    id: 'generic',
    name: 'Any other CSV',
    what: 'Backloggd community exports, spreadsheets, other trackers.',
    how: [
      'Choose the CSV, then say which column holds the title, year, section, status, rating, platform and date.',
      'The mapping is remembered on this device for files with the same columns.',
    ],
    input: 'mapped-csv',
    accept: '.csv,.tsv,text/csv',
  },
  {
    id: 'ai',
    name: 'Paste a list',
    what: 'Any list as text or a screenshot, read by AI.',
    how: ['Paste the list or choose an image (PNG, JPEG or WebP, up to 6 MB), then check the matches.'],
    input: 'paste',
  },
];

/** The warning for an account with more titles than one import takes. */
function cutWarning(cut: number | undefined): string[] {
  return cut && cut > 0
    ? [`Only the first ${MAX_IMPORT_ROWS} titles are imported at once; ${cut} more were left out.`]
    : [];
}

/** Parse one source's files into rows. Throws a readable message on bad input. */
async function parseFiles(source: FileSource, files: File[]): Promise<ParseResult> {
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
  if (source === 'mal') {
    const merged: ParseResult = { rows: [], skipped: 0, warnings: [] };
    for (const f of files) {
      let xml: string;
      try {
        xml = malExportText(new Uint8Array(await f.arrayBuffer()));
      } catch {
        throw new Error(`${f.name} could not be unpacked. Upload the .xml.gz as downloaded, or the .xml inside it.`);
      }
      const part = parseMalXml(xml);
      merged.rows.push(...part.rows);
      merged.skipped += part.skipped;
      merged.warnings.push(...part.warnings.map((w) => `${f.name}: ${w}`));
    }
    return merged;
  }
  const text = await files[0].text();
  if (source === 'hoard') return parseHoardCsv(text);
  if (source === 'goodreads') return parseGoodreads(text);
  return parseStoryGraph(text);
}

interface ImportClientProps {
  steamConfigured: boolean;
  steamLinked: boolean;
  /** Start this source straight away (Settings → Accounts → Steam → Import library). */
  autoStart?: 'steam' | null;
  tmdbConfigured: boolean;
  traktConfigured: boolean;
  aiConfigured: boolean;
}

/** A CSV waiting for its column mapping. */
interface PendingCsv {
  fileName: string;
  headers: string[];
  records: Record<string, string>[];
}

export function ImportClient({ steamConfigured, steamLinked, autoStart, tmdbConfigured, traktConfigured, aiConfigured }: ImportClientProps) {
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [runId, setRunId] = useState(0);
  const [busy, setBusy] = useState<ImportSource | null>(null);
  const [finished, setFinished] = useState(false);
  const [csv, setCsv] = useState<PendingCsv | null>(null);
  const [pasting, setPasting] = useState(false);

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
    setCsv(null);
    setPasting(false);
    setRows(list);
    setRunId((n) => n + 1);
  }

  async function onFiles(source: SourceInfo, files: File[]) {
    if (files.length === 0) return;
    setBusy(source.id);
    try {
      if (source.input === 'mapped-csv') {
        const f = files[0];
        if (f.size > MAX_IMPORT_FILE_BYTES) throw new Error(`${f.name} is larger than 20 MB.`);
        const { headers, records } = csvRecords(await f.text());
        if (headers.filter(Boolean).length === 0 || records.length === 0) throw new Error(`${f.name} has no header row or no lines.`);
        setCsv({ fileName: f.name, headers, records });
        return;
      }
      start(await parseFiles(source.id as FileSource, files), source.name);
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
      else start({ rows: res.rows, skipped: res.skipped ?? 0, warnings: cutWarning(res.cut) }, 'AniList');
    } catch {
      toast.error('Could not reach the server. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function onSteam() {
    setBusy('steam');
    try {
      const res = await fetchSteamRows();
      if (!res.ok || !res.rows) toast.error(res.error ?? 'Could not read your Steam games.');
      else start({ rows: res.rows, skipped: res.skipped ?? 0, warnings: cutWarning(res.cut) }, 'Steam');
    } catch {
      toast.error('Could not reach the server. Try again.');
    } finally {
      setBusy(null);
    }
  }

  // Arriving from Settings → Accounts → Steam → Import library.
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (autoStart !== 'steam' || autoStarted || !steamConfigured || !steamLinked) return;
    setAutoStarted(true);
    void onSteam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, autoStarted, steamConfigured, steamLinked]);

  async function onTrakt(input: string) {
    const user = traktUserFromInput(input);
    if (!validTraktUser(user)) {
      toast.error('That is not a Trakt username.');
      return;
    }
    setBusy('trakt');
    try {
      const res = await fetchTraktRows(user);
      if (!res.ok || !res.rows) toast.error(res.error ?? 'Could not read that Trakt profile.');
      else start({ rows: res.rows, skipped: res.skipped ?? 0, warnings: cutWarning(res.cut) }, 'Trakt');
    } catch {
      toast.error('Could not reach the server. Try again.');
    } finally {
      setBusy(null);
    }
  }

  if (csv && !rows) {
    return (
      <GenericMapper
        key={csv.fileName}
        fileName={csv.fileName}
        headers={csv.headers}
        records={csv.records}
        onRows={(result) => start(result, 'CSV')}
        onCancel={() => setCsv(null)}
      />
    );
  }

  if (pasting && !rows) {
    return (
      <AiPaste
        configured={aiConfigured}
        onRows={(list) => start({ rows: list, skipped: 0, warnings: [] }, 'pasted')}
        onCancel={() => setPasting(false)}
      />
    );
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
            {s.id === 'trakt' && !traktConfigured && (
              <NotConfigured>Trakt isn&apos;t configured on this server (TRAKT_CLIENT_ID).</NotConfigured>
            )}
            {s.id === 'steam' && !steamConfigured && (
              <NotConfigured>Steam isn&apos;t configured on this server (STEAM_API_KEY).</NotConfigured>
            )}
            {s.id === 'ai' && !aiConfigured && (
              <NotConfigured>The AI reader isn&apos;t configured on this server (GEMINI_API_KEY).</NotConfigured>
            )}
            {s.input === 'file' || s.input === 'mapped-csv' ? (
              <FilePick source={s} busy={busy === s.id} disabled={busy !== null} onFiles={(f) => void onFiles(s, f)} />
            ) : s.input === 'paste' ? (
              <Button type="button" variant="outline" size="sm" disabled={busy !== null || !aiConfigured} onClick={() => setPasting(true)}>
                <ClipboardPaste className="mr-2 h-4 w-4" aria-hidden />
                Paste a list
              </Button>
            ) : s.input === 'account' ? (
              steamLinked || !steamConfigured ? (
                <Button type="button" variant="outline" size="sm" disabled={busy !== null || !steamConfigured} onClick={() => void onSteam()}>
                  {busy === 'steam' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Download className="mr-2 h-4 w-4" aria-hidden />}
                  Fetch my Steam games
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href={settingsHref('accounts')}>Link Steam in Settings</Link>
                </Button>
              )
            ) : s.id === 'trakt' ? (
              <UsernameForm
                label="Trakt username"
                busy={busy === 'trakt'}
                disabled={busy !== null || !traktConfigured}
                onSubmit={(u) => void onTrakt(u)}
              />
            ) : (
              <UsernameForm
                label="AniList username"
                busy={busy === 'anilist'}
                disabled={busy !== null}
                onSubmit={(u) => void onAniList(u)}
              />
            )}
          </CardContent>
        </Card>
      ))}
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
        accept={source.accept}
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

function NotConfigured({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children} Ask the owner to add it.</span>
    </p>
  );
}

function UsernameForm({
  label,
  busy,
  disabled,
  onSubmit,
}: {
  label: string;
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
        placeholder={label}
        aria-label={label}
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
