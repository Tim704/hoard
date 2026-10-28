'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, Copy, Download, Link2, Loader2, Sparkles } from 'lucide-react';

import { copy, settled } from '@/components/tier-share';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createShareLink } from '@/lib/actions/share';
import { yearVerdict } from '@/lib/actions/stats';
import { proxiedImageUrl } from '@/lib/img-proxy';
import { yearPngFileName } from '@/lib/share';

/** What the year PNG shows: the summary numbers and covers; no scores or notes. */
export interface YearCard {
  year: number;
  finished: number;
  hours: number;
  pages: number;
  episodes: number;
  sections: { label: string; finished: number; color: string }[];
  busiestMonth: string | null;
  topFranchise: string | null;
  sTier: { title: string; imageUrl: string | null }[];
  topThree: { title: string; imageUrl: string | null }[];
}

/**
 * The year in review's sharing row (6.1 / 4.1): "Download PNG" draws a
 * dedicated export layout with html-to-image (loaded on click; covers through
 * the same-origin /api/img proxy), "Share link" creates or reuses the year's
 * public link (summary numbers and covers only).
 */
export function YearShare({ card }: { card: YearCard }) {
  const [exporting, setExporting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  async function downloadPng() {
    setExporting(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const node = exportRef.current;
      if (!node) throw new Error('nothing to draw');
      await Promise.all([...node.querySelectorAll('img')].map(settled));
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: false,
        imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAIAAAOXl5QAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = yearPngFileName(card.year);
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error('Could not draw the image. Try again.');
    } finally {
      setExporting(false);
    }
  }

  function share() {
    startTransition(async () => {
      const res = await createShareLink('year', String(card.year));
      if (!res.ok || !res.url) {
        toast.error(res.error ?? 'Could not create the link.');
        return;
      }
      setUrl(res.url);
      setCopied(await copy(res.url));
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void downloadPng()} disabled={exporting || card.finished === 0}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Download className="mr-2 h-4 w-4" aria-hidden />}
          Download PNG
        </Button>
        <Button variant="outline" size="sm" onClick={share} disabled={isPending}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="mr-2 h-4 w-4" aria-hidden />}
          Share link
        </Button>
      </div>
      {url && (
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex gap-2">
            <Input readOnly value={url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 text-base sm:text-sm" />
            <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={async () => setCopied(await copy(url))}>
              {copied ? <Check className="mr-2 h-4 w-4" aria-hidden /> : <Copy className="mr-2 h-4 w-4" aria-hidden />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Anyone with this link sees your {card.year} summary: the numbers and the covers of your S-tier and top 3 titles
            (no scores, no notes). Revoke it any time in{' '}
            <Link href="/settings#sharing" className="underline underline-offset-2">
              Settings → Sharing
            </Link>
            .
          </p>
        </div>
      )}
      {exporting && (
        <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
          <YearExportLayout innerRef={exportRef} card={card} />
        </div>
      )}
    </div>
  );
}

/** "AI verdict" (6.1): a Gemini paragraph on the year, through the shared AI limiter. */
export function AiVerdict({ year }: { year: number }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  function run() {
    setError(null);
    startTransition(async () => {
      const res = await yearVerdict(year);
      setText(res.text || null);
      setError(res.error ?? null);
    });
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden />
          AI verdict
        </h2>
        <Button variant="outline" size="sm" onClick={run} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          {text ? 'Ask again' : 'Judge my year'}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Sends only this page&apos;s summary numbers and titles to Gemini.</p>
      <div aria-live="polite">
        {error && <p className="mt-3 text-sm text-muted-foreground">{error}</p>}
        {text && !isPending && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{text}</p>}
      </div>
    </div>
  );
}

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MUTED = '#71717a';

/** The PNG's layout: big numbers, sections, covers and the Hoard footer. Inline styles only. */
function YearExportLayout({ card, innerRef }: { card: YearCard; innerRef: React.Ref<HTMLDivElement> }) {
  const numbers = [
    { label: 'titles finished', value: card.finished },
    { label: 'hours watched', value: card.hours },
    { label: 'pages read', value: card.pages },
    { label: 'episodes', value: card.episodes },
  ].filter((n) => n.value > 0 || n.label === 'titles finished');
  const covers = (title: string, items: YearCard['sTier']) =>
    items.length === 0 ? null : (
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {items.slice(0, 12).map((it, i) => {
            const src = proxiedImageUrl(it.imageUrl);
            return (
              <div key={i} style={{ width: 72 }}>
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- drawn by html-to-image
                  <img src={src} alt="" width={72} height={108} style={{ width: 72, height: 108, objectFit: 'cover', borderRadius: 4, display: 'block', background: '#e4e4e7' }} />
                ) : (
                  <div style={{ width: 72, height: 108, borderRadius: 4, background: '#e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: MUTED }}>
                    {it.title.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div style={{ fontSize: 9, lineHeight: '11px', marginTop: 3, maxHeight: 22, overflow: 'hidden', overflowWrap: 'anywhere' }}>{it.title}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  return (
    <div ref={innerRef} style={{ width: 720, padding: 32, background: '#ffffff', color: '#18181b', fontFamily: FONT }}>
      <div style={{ fontSize: 14, color: MUTED, fontWeight: 600 }}>My year in review</div>
      <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1, lineHeight: 1.1 }}>{card.year}</div>
      <div style={{ display: 'flex', gap: 28, marginTop: 20, flexWrap: 'wrap' }}>
        {numbers.map((n) => (
          <div key={n.label}>
            <div style={{ fontSize: 30, fontWeight: 800 }}>{n.value.toLocaleString('en-US')}</div>
            <div style={{ fontSize: 12, color: MUTED }}>{n.label}</div>
          </div>
        ))}
      </div>
      {card.sections.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 18, fontSize: 12 }}>
          {card.sections.map((s) => (
            <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }} />
              {s.label} <b>{s.finished}</b>
            </span>
          ))}
        </div>
      )}
      {(card.busiestMonth || card.topFranchise) && (
        <div style={{ marginTop: 14, fontSize: 12, color: MUTED }}>
          {card.busiestMonth && <span>Busiest month: <b style={{ color: '#18181b' }}>{card.busiestMonth}</b></span>}
          {card.busiestMonth && card.topFranchise && <span> · </span>}
          {card.topFranchise && <span>Top franchise: <b style={{ color: '#18181b' }}>{card.topFranchise}</b></span>}
        </div>
      )}
      {covers('Top 3 of the year', card.topThree)}
      {covers('New in tier S', card.sTier)}
      <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: MUTED }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, background: '#7c3aed', display: 'inline-block' }} />
        <span style={{ fontWeight: 700, color: '#18181b' }}>Hoard</span>
      </div>
    </div>
  );
}
