'use client';

// ───────────────────────────────────────────────────────────────────────────
//  "Send a title" on /recommendations: pick a title from your library, then
//  the same send form as a title's view (RecommendPanel). The library comes
//  from the palette's index, loaded when the dialog first opens.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, ImageOff, Loader2, Send } from 'lucide-react';

import { useDisplayTitle } from '@/components/prefs-provider';
import { RecommendPanel } from '@/components/title/recommend-panel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { libraryIndex } from '@/lib/actions/search';
import { CATEGORIES } from '@/lib/categories';
import type { LibraryIndexEntry } from '@/lib/data-search';
import { titleVariants } from '@/lib/title';

const SHOWN = 40;

export function SendTitleButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send className="h-4 w-4" aria-hidden />
        Send a title
      </Button>
      <SendTitleDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function SendTitleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleOf = useDisplayTitle();
  const [index, setIndex] = useState<LibraryIndexEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<LibraryIndexEntry | null>(null);

  useEffect(() => {
    if (!open || index) return;
    let live = true;
    libraryIndex().then(
      (rows) => live && setIndex(rows ?? []),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [open, index]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = index ?? [];
    return (q ? rows.filter((e) => titleVariants(e).some((t) => t.toLowerCase().includes(q))) : rows).slice(0, SHOWN);
  }, [index, query]);

  const close = () => {
    setQuery('');
    setPicked(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{picked ? titleOf(picked) : 'Send a title'}</DialogTitle>
          <DialogDescription>
            {picked ? 'Add a note and a guess, then send it.' : 'Pick something from your library to pass along.'}
          </DialogDescription>
        </DialogHeader>
        {picked ? (
          <div className="space-y-3">
            <RecommendPanel activityId={picked.id} startOpen />
            <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(null)}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Pick another
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your library…"
              aria-label="Search your library"
            />
            {failed ? (
              <p className="text-sm text-muted-foreground">Couldn’t load your library. Try again.</p>
            ) : !index ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading your library…
              </p>
            ) : matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {index.length === 0 ? 'Your library is empty. Add a title first.' : 'No title in your library matches.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {matches.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(e)}
                      className="flex min-h-11 w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-accent"
                    >
                      <span className="relative h-10 w-7 shrink-0 overflow-hidden rounded bg-muted">
                        {e.imageUrl ? (
                          <Image src={e.imageUrl} alt="" fill sizes="28px" className="object-cover" />
                        ) : (
                          <ImageOff className="m-auto mt-3 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{titleOf(e)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[CATEGORIES[e.category].singular, e.year].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
