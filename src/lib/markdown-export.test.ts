import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  markdownFiles,
  markdownNote,
  markdownZip,
  obsidianTag,
  providerUrl,
  sanitizeFilename,
  yamlString,
  type MarkdownEntry,
} from './markdown-export';

const entry = (over: Partial<MarkdownEntry> = {}): MarkdownEntry => ({
  category: 'movies',
  title: 'Alien',
  aliases: [],
  year: 1979,
  status: 'COMPLETED',
  rating: 9,
  tier: 'S',
  started: null,
  finished: '2026-10-01',
  timesFinished: 1,
  tags: [],
  franchise: null,
  favourite: false,
  platforms: [],
  format: null,
  link: null,
  notes: null,
  reviews: [],
  ...over,
});

/** A tiny YAML reader for the front matter we write (scalars + string lists). */
function frontMatter(note: string): Record<string, unknown> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(note);
  if (!m) throw new Error('no front matter');
  const out: Record<string, unknown> = {};
  let listKey: string | null = null;
  for (const line of m[1].split('\n')) {
    const item = /^ {2}- (.*)$/.exec(line);
    if (item && listKey) {
      (out[listKey] as unknown[]).push(JSON.parse(item[1]));
      continue;
    }
    const kv = /^([a-z_]+):(?: (.*))?$/.exec(line);
    if (!kv) throw new Error(`bad line: ${line}`);
    const [, key, raw] = kv;
    if (raw === undefined) {
      out[key] = [];
      listKey = key;
      continue;
    }
    listKey = null;
    // Our double-quoted scalars use JSON-compatible escapes for these inputs.
    out[key] = raw === 'null' ? null : raw === '[]' ? [] : raw.startsWith('"') ? JSON.parse(raw) : /^\d{4}-/.test(raw) ? raw : JSON.parse(raw);
  }
  return out;
}

describe('sanitizeFilename', () => {
  it('drops characters file systems reject and trims dots and spaces', () => {
    expect(sanitizeFilename('Re:Zero / Starting "Life" <in> Another|World?*')).toBe('Re Zero Starting Life in Another World');
    expect(sanitizeFilename('back\\slash')).toBe('back slash');
    expect(sanitizeFilename('tab\there\u0001x')).toBe('tab here x');
    expect(sanitizeFilename('...hidden')).toBe('hidden');
    expect(sanitizeFilename('Trailing dots...  ')).toBe('Trailing dots');
    expect(sanitizeFilename('So long. ', '(2001)')).toBe('So long (2001)');
  });

  it('never returns an empty or device name', () => {
    expect(sanitizeFilename('???')).toBe('Untitled');
    expect(sanitizeFilename('')).toBe('Untitled');
    expect(sanitizeFilename('CON')).toBe('CON_');
    expect(sanitizeFilename('nul')).toBe('nul_');
    expect(sanitizeFilename('Console')).toBe('Console');
  });

  it('keeps names to 120 characters with the year intact', () => {
    const long = 'A'.repeat(300);
    const name = sanitizeFilename(long, '(1999)');
    expect(Array.from(name).length).toBe(120);
    expect(name.endsWith(' (1999)')).toBe(true);
    // Never splits a surrogate pair.
    const emoji = sanitizeFilename('😀'.repeat(200));
    expect(Array.from(emoji).length).toBe(120);
    expect(emoji).toBe('😀'.repeat(120));
  });
});

describe('yamlString', () => {
  it('quotes and escapes anything YAML would misread', () => {
    expect(yamlString('plain')).toBe('"plain"');
    expect(yamlString('Re: "Zero"')).toBe('"Re: \\"Zero\\""');
    expect(yamlString('C:\\path')).toBe('"C:\\\\path"');
    expect(yamlString('line\nbreak\ttab')).toBe('"line\\nbreak\\ttab"');
    expect(yamlString('\u0007bell')).toBe('"\\x07bell"');
    expect(yamlString('- dash # hash: colon')).toBe('"- dash # hash: colon"');
    expect(yamlString('a\u2028b')).toBe('"a\\Lb"');
  });
});

describe('markdownNote', () => {
  it('writes front matter that reads back to the same values', () => {
    const note = markdownNote(
      entry({
        title: 'Re: "Zero" — Starting Life',
        aliases: ['Re:Zero kara Hajimeru', 'Re: "Zero" — Starting Life'],
        category: 'anime',
        status: 'CONSUMING',
        tags: ['comfort reread', 'Sci-fi'],
        franchise: 'Re:Zero',
        favourite: true,
        started: '2026-01-02',
        finished: null,
        tier: null,
        rating: 8.5,
        link: 'https://anilist.co/anime/21355',
      }),
    );
    const fm = frontMatter(note);
    expect(fm).toMatchObject({
      title: 'Re: "Zero" — Starting Life',
      aliases: ['Re: "Zero" — Starting Life', 'Re:Zero kara Hajimeru'],
      section: 'Anime',
      year: 1979,
      status: 'Watching',
      status_code: 'CONSUMING',
      score: 8.5,
      tier: null,
      started: '2026-01-02',
      finished: null,
      times_finished: 1,
      tags: ['comfort-reread', 'Sci-fi'],
      franchise: 'Re:Zero',
      favourite: true,
      link: 'https://anilist.co/anime/21355',
    });
    expect(fm).not.toHaveProperty('platforms');
  });

  it('puts notes first, then dated reviews newest first', () => {
    const note = markdownNote(
      entry({
        notes: 'Better than [[Aliens]].\r\nSecond line.',
        reviews: [
          { date: '2020-05-01', rating: 8, rewatch: false, review: 'First time.' },
          { date: '2026-10-01', rating: 9, rewatch: true, review: 'Even better.' },
          { date: '2024-01-01', rating: null, rewatch: false, review: null },
        ],
      }),
    );
    const body = note.split('\n---\n')[1];
    expect(body.indexOf('Better than [[Aliens]].\nSecond line.')).toBeGreaterThan(0);
    const order = ['### 2026-10-01 · 9/10 · again', 'Even better.', '### 2024-01-01', '### 2020-05-01 · 8/10', 'First time.'].map((s) =>
      body.indexOf(s),
    );
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(body.indexOf('Better than')).toBeLessThan(body.indexOf('## Diary'));
  });

  it('lists a game platforms and keeps a body free of front-matter breakers', () => {
    const note = markdownNote(entry({ category: 'games', platforms: ['PC', 'Switch'], notes: '---\nnot yaml' }));
    expect(frontMatter(note).platforms).toEqual(['PC', 'Switch']);
    expect(note.startsWith('---\n')).toBe(true);
  });
});

describe('markdownFiles', () => {
  it('names files Section/Title (Year).md and numbers collisions', () => {
    const files = markdownFiles([
      entry({ title: 'Solaris', year: 1972 }),
      entry({ title: 'Solaris', year: 1972 }),
      entry({ title: 'solaris', year: 1972 }),
      entry({ title: 'Solaris', year: 2002 }),
      entry({ title: 'Dune', year: null, category: 'books' }),
      entry({ title: 'Dune', year: null, category: 'movies' }),
      entry({ title: 'Halo: Combat Evolved', year: 2001, category: 'games' }),
    ]);
    expect(files.map((f) => f.path)).toEqual([
      'Books/Dune.md',
      'Movies/Dune.md',
      'Movies/solaris (1972).md',
      'Movies/Solaris (1972) (2).md',
      'Movies/Solaris (1972) (3).md',
      'Movies/Solaris (2002).md',
      'Video Games/Halo Combat Evolved (2001).md',
    ]);
  });

  it('zips them so they unzip to the same text', () => {
    const files = markdownFiles([entry({ title: 'Ünïcødé 映画', notes: 'ok' })]);
    const out = unzipSync(markdownZip(files));
    expect(Object.keys(out)).toEqual(['Movies/Ünïcødé 映画 (1979).md']);
    expect(strFromU8(out['Movies/Ünïcødé 映画 (1979).md'])).toBe(files[0].content);
  });
});

describe('providerUrl and tags', () => {
  it('derives provider pages from known id shapes only', () => {
    expect(providerUrl('movies', { externalId: '603' })).toBe('https://www.themoviedb.org/movie/603');
    expect(providerUrl('tv', { externalId: '1396' })).toBe('https://www.themoviedb.org/tv/1396');
    expect(providerUrl('anime', { externalId: '5114' })).toBe('https://myanimelist.net/anime/5114');
    expect(providerUrl('manga', { externalId: 'al-30013' })).toBe('https://anilist.co/manga/30013');
    expect(providerUrl('books', { externalId: '/works/OL893414W' })).toBe('https://openlibrary.org/works/OL893414W');
    expect(providerUrl('games', { externalId: '1942', steamAppId: 292030 })).toBe('https://store.steampowered.com/app/292030');
    expect(providerUrl('games', { externalId: '1942' })).toBeNull();
    expect(providerUrl('music', { externalId: 'x', artist: 'Daft Punk', title: 'Random Access Memories' })).toBe(
      'https://www.last.fm/music/Daft+Punk/Random+Access+Memories',
    );
    expect(providerUrl('movies', { externalId: 'manual:abc' })).toBeNull();
    expect(providerUrl('movies', { externalId: 'demo-movie-alien' })).toBeNull();
  });

  it('makes tags Obsidian-safe', () => {
    expect(obsidianTag(' comfort  reread ')).toBe('comfort-reread');
    expect(obsidianTag('#sci-fi')).toBe('sci-fi');
  });
});
