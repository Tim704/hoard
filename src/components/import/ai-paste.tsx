'use client';

// "Paste a list" (spec 2.8): text or a screenshot goes to /api/ai/parse-list,
// the AI reads out the titles, and they go to the review screen as Done or
// Want. Titles the AI can't place in a section go to the one picked here.

import { useRef, useState } from 'react';
import { ImageUp, Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CATEGORIES, NAV_ORDER, type CategorySlug } from '@/lib/categories';
import { AI_MAX_IMAGE_BYTES, AI_MAX_TEXT, aiItemsToRows, type AiItem } from '@/lib/import/ai';
import type { ImportRow } from '@/lib/import/types';
import { statusLabel } from '@/lib/status';
import { cn } from '@/lib/utils';

interface AiPasteProps {
  configured: boolean;
  onRows: (rows: ImportRow[]) => void;
  onCancel: () => void;
}

export function AiPaste({ configured, onRows, onCancel }: AiPasteProps) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [section, setSection] = useState<CategorySlug>('movies');
  const [done, setDone] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickImage(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast.error('Choose a PNG, JPEG or WebP image.');
      return;
    }
    if (file.size > AI_MAX_IMAGE_BYTES) {
      toast.error('That image is larger than 6 MB.');
      return;
    }
    setImage(file);
  }

  async function submit() {
    const body = new FormData();
    if (image) body.set('image', image);
    else body.set('text', text.trim());
    setBusy(true);
    try {
      const res = await fetch('/api/ai/parse-list', { method: 'POST', body });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; items?: AiItem[] } | null;
      if (!json?.ok || !json.items) {
        toast.error(json?.error ?? 'The AI reader is unavailable right now.');
        return;
      }
      if (json.items.length === 0) {
        toast.error('No titles were found in that.');
        return;
      }
      onRows(aiItemsToRows(json.items, { defaultSection: section, status: done ? 'COMPLETED' : 'PLANNED' }));
    } catch {
      toast.error('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const tooLong = text.length > AI_MAX_TEXT;
  const canSend = configured && !busy && (image !== null || (text.trim() !== '' && !tooLong));

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-3 sm:p-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Paste a list</h2>
        <p className="text-sm text-muted-foreground">
          A top-10 from a forum, a note on your phone, a screenshot of a shelf: the AI picks out the titles, then you
          check every match.
        </p>
        {!configured && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            The AI reader isn&apos;t configured on this server (GEMINI_API_KEY). Ask the owner to add it.
          </p>
        )}
      </div>

      {image ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <span className="min-w-0 truncate">{image.name}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setImage(null)} aria-label="Remove the image">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={'1. Heat (1995)\n2. Collateral\n3. Thief…'}
            aria-label="The list to read"
            className="text-base sm:text-sm"
            disabled={busy}
          />
          <p className={cn('text-xs text-muted-foreground', tooLong && 'text-rose-600 dark:text-rose-400')}>
            {text.length.toLocaleString('en')} / {AI_MAX_TEXT.toLocaleString('en')} characters
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Screenshot of a list"
          onChange={(e) => {
            pickImage(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          <ImageUp className="mr-2 h-4 w-4" aria-hidden />
          {image ? 'Another image' : 'Use a screenshot instead'}
        </Button>
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-muted-foreground">Section when unclear</span>
          <Select value={section} onValueChange={(v) => setSection(v as CategorySlug)}>
            <SelectTrigger className="h-9 w-40" aria-label="Section when unclear">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NAV_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {CATEGORIES[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="space-y-1 text-sm" role="group" aria-label="Add them as">
          <span className="block text-xs text-muted-foreground">Add them as</span>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant={done ? 'default' : 'outline'} aria-pressed={done} onClick={() => setDone(true)}>
              Done ({statusLabel('COMPLETED', section)})
            </Button>
            <Button type="button" size="sm" variant={done ? 'outline' : 'default'} aria-pressed={!done} onClick={() => setDone(false)}>
              Want
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button type="button" disabled={!canSend} onClick={() => void submit()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="mr-2 h-4 w-4" aria-hidden />}
          {busy ? 'Reading…' : 'Read the list'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
