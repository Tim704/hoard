'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, Copy, Download, Link2, Loader2 } from 'lucide-react';

import { usePrefs, useDisplayTitle } from '@/components/prefs-provider';
import { TIER_HEX } from '@/components/tier-colors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createShareLink } from '@/lib/actions/share';
import type { CategorySlug } from '@/lib/categories';
import { proxiedImageUrl } from '@/lib/img-proxy';
import { formatYmd, todayYmd } from '@/lib/release';
import { tierPngFileName } from '@/lib/share';
import { TIERS, type TierBoardData } from '@/lib/tiers';
import { settingsHref } from '@/lib/settings-nav';

interface TierShareProps {
  slug: CategorySlug;
  /** The section's label ("Books"). */
  label: string;
  board: TierBoardData;
}

/**
 * The Tiers tab's sharing row (spec 4.1): "Download PNG" draws a dedicated
 * export layout (covers through the same-origin /api/img proxy, so the
 * canvas stays readable) with html-to-image, loaded only on click; "Share
 * link" creates or reuses the section's public read-only link.
 */
export function TierShare({ slug, label, board }: TierShareProps) {
  const { timeZone } = usePrefs();
  const [exporting, setExporting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const today = () => todayYmd(timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const placed = TIERS.reduce((n, t) => n + board.tiers[t].length, 0);

  async function downloadPng() {
    setExporting(true);
    try {
      // Let React mount the off-screen layout, then wait for its covers.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const node = exportRef.current;
      if (!node) throw new Error('nothing to draw');
      await Promise.all([...node.querySelectorAll('img')].map(settled));
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: false,
        // A cover that fails to load becomes a grey box, not a failed export.
        imagePlaceholder:
          'data:image/gif;base64,R0lGODlhAQABAIAAAOXl5QAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = tierPngFileName(slug, today());
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error('Could not draw the tier list. Try again.');
    } finally {
      setExporting(false);
    }
  }

  function share() {
    startTransition(async () => {
      const res = await createShareLink('tiers', slug);
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
        <Button variant="outline" size="sm" onClick={() => void downloadPng()} disabled={exporting || placed === 0}>
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
            <Input
              readOnly
              value={url}
              aria-label="Share link"
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 min-w-0 flex-1 text-base sm:text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              onClick={async () => setCopied(await copy(url))}
            >
              {copied ? <Check className="mr-2 h-4 w-4" aria-hidden /> : <Copy className="mr-2 h-4 w-4" aria-hidden />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Anyone with this link sees this tier list (titles and covers only). Revoke it any time in{' '}
            <Link href={settingsHref('sharing')} className="underline underline-offset-2">
              {'Settings → Sharing & privacy'}
            </Link>
            .
          </p>
        </div>
      )}

      {exporting && (
        // Off-screen while it is drawn; fixed width so every PNG looks the same.
        <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
          <ExportLayout innerRef={exportRef} label={label} board={board} day={today()} />
        </div>
      )}
    </div>
  );
}

/** Resolves once an image has loaded or failed. */
export function settled(img: HTMLImageElement): Promise<void> {
  if (img.complete) return Promise.resolve();
  return new Promise((resolve) => {
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener('error', () => resolve(), { once: true });
  });
}

/** Copy to the clipboard; false when the browser refuses. */
export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** The PNG's layout: title, S–F rows with covers, and the Hoard footer. Inline styles only. */
function ExportLayout({
  label,
  board,
  innerRef,
  day,
}: {
  day: string;
  label: string;
  board: TierBoardData;
  innerRef: React.Ref<HTMLDivElement>;
}) {
  const titleOf = useDisplayTitle();
  return (
    <div ref={innerRef} style={{ width: 760, padding: 28, background: '#ffffff', color: '#18181b', fontFamily: FONT }}>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, marginBottom: 18 }}>My {label} tier list</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {TIERS.map((tier) => (
          <div key={tier} style={{ display: 'flex', border: '1px solid #e4e4e7', borderRadius: 8, overflow: 'hidden', minHeight: 96 }}>
            <div
              style={{
                width: 64,
                flexShrink: 0,
                background: TIER_HEX[tier],
                color: '#ffffff',
                fontSize: 32,
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {tier}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 6, flex: 1, background: '#fafafa' }}>
              {board.tiers[tier].map((a) => {
                const src = proxiedImageUrl(a.media.imageUrl);
                const title = titleOf(a.media);
                return (
                  <div key={a.id} style={{ width: 64 }}>
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element -- drawn by html-to-image
                      <img src={src} alt="" width={64} height={96} style={{ width: 64, height: 96, objectFit: 'cover', borderRadius: 4, display: 'block', background: '#e4e4e7' }} />
                    ) : (
                      <div style={{ width: 64, height: 96, borderRadius: 4, background: '#e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#71717a' }}>
                        {title.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 9,
                        lineHeight: '11px',
                        marginTop: 3,
                        maxHeight: 22,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {title}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#71717a' }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, background: '#7c3aed', display: 'inline-block' }} />
        <span style={{ fontWeight: 700, color: '#18181b' }}>Hoard</span>
        <span>· {formatYmd(day)}</span>
      </div>
    </div>
  );
}
