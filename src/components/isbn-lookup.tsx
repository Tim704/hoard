'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';

import { AddResultRow, useAddRows, type LibraryEntry } from '@/components/add-row';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { settle } from '@/lib/action-result';
import { lookupBookByIsbn, type IsbnLookupResult } from '@/lib/actions/search';
import { normalizeIsbn } from '@/lib/isbn';

// ───────────────────────────────────────────────────────────────────────────
//  Books by ISBN (spec 2.9): type it, or scan the barcode with the camera.
//  Scanning uses the browser's BarcodeDetector where it exists; otherwise
//  @zxing/browser is imported on demand (never part of the main bundle).
//  No camera or no permission → a friendly line; typing still works.
// ───────────────────────────────────────────────────────────────────────────

/** Stops whatever is scanning and releases the camera. */
type StopFn = () => void;

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}

function cameraMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was blocked. Allow it in your browser, or type the ISBN instead.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera found. Type the ISBN instead.';
  }
  return 'The camera could not be started. Type the ISBN instead.';
}

export function IsbnLookup({ library }: { library: Record<string, LibraryEntry> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<IsbnLookupResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const rows = useAddRows();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<StopFn | null>(null);
  // Bumped by every start, Stop and unmount: a start that awaited (camera
  // prompt, scanner import) checks it and backs out if it is no longer current.
  const scanId = useRef(0);

  function stopScan() {
    scanId.current++;
    stopRef.current?.();
    stopRef.current = null;
    setScanning(false);
  }

  // Release the camera when the dialog closes.
  useEffect(
    () => () => {
      scanId.current++;
      stopRef.current?.();
      stopRef.current = null;
    },
    [],
  );

  async function lookup(raw: string) {
    const isbn = normalizeIsbn(raw);
    if (!isbn) {
      setAnswer({ ok: false, error: 'That isn’t a valid ISBN. Check the digits and try again.' });
      return;
    }
    setBusy(true);
    // An error page or no network: the unreachable message, not nothing.
    setAnswer(await settle(lookupBookByIsbn(isbn)));
    setBusy(false);
  }

  function onCode(code: string): boolean {
    const isbn = normalizeIsbn(code);
    if (!isbn) return false; // e.g. a price add-on code: keep scanning
    stopScan();
    setValue(isbn);
    void lookup(isbn);
    return true;
  }

  async function startScan() {
    setCameraError(null);
    setAnswer(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser can’t use the camera here. Type the ISBN instead.');
      return;
    }
    stopRef.current?.();
    stopRef.current = null;
    const id = ++scanId.current;
    const cancelled = () => scanId.current !== id;
    setScanning(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (err) {
      if (cancelled()) return;
      setScanning(false);
      setCameraError(cameraMessage(err));
      return;
    }
    const releaseStream = () => stream.getTracks().forEach((t) => t.stop());
    const video = videoRef.current;
    if (cancelled() || !video) {
      releaseStream();
      if (!cancelled()) setScanning(false);
      return;
    }

    const Detector = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike })
      .BarcodeDetector;
    if (Detector) {
      video.srcObject = stream;
      await video.play().catch(() => {});
      if (cancelled()) {
        video.srcObject = null;
        releaseStream();
        return;
      }
      const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a'] });
      let live = true;
      const tick = async () => {
        if (!live) return;
        try {
          const codes = await detector.detect(video);
          for (const c of codes) if (onCode(c.rawValue)) return;
        } catch {
          // A frame that can't be read yet; try the next one.
        }
        if (live) setTimeout(() => void tick(), 250);
      };
      stopRef.current = () => {
        live = false;
        video.srcObject = null;
        releaseStream();
      };
      void tick();
      return;
    }

    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ]);
      const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]]]);
      if (cancelled()) {
        releaseStream();
        return;
      }
      const reader = new BrowserMultiFormatReader(hints);
      const controls = await reader.decodeFromStream(stream, video, (result) => {
        if (result && !cancelled()) onCode(result.getText());
      });
      if (cancelled()) {
        controls.stop();
        releaseStream();
        return;
      }
      stopRef.current = () => {
        controls.stop();
        releaseStream();
      };
    } catch {
      releaseStream();
      if (cancelled()) return;
      setScanning(false);
      setCameraError('The barcode scanner could not start. Type the ISBN instead.');
    }
  }

  const result = answer?.ok ? answer.result : null;
  const key = result ? result.externalId : '';

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(value);
        }}
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="numeric"
          placeholder="ISBN, e.g. 978-0-441-17271-9"
          aria-label="ISBN"
          className="h-10 min-w-0 flex-1 text-base sm:h-9 sm:text-sm"
          autoComplete="off"
        />
        <Button type="submit" size="sm" variant="outline" className="h-10 sm:h-9" disabled={busy || !value.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look up'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-10 sm:h-9"
          onClick={() => (scanning ? stopScan() : void startScan())}
        >
          {scanning ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          <span className="ml-1.5">{scanning ? 'Stop' : 'Scan a barcode'}</span>
        </Button>
      </form>

      {/* Always mounted so the scanner has its element; shown while scanning. */}
      <video
        ref={videoRef}
        className={scanning ? 'aspect-video w-full rounded bg-black object-cover' : 'hidden'}
        muted
        playsInline
        aria-label="Camera preview"
      />

      {cameraError && <p className="text-sm text-muted-foreground" role="status">{cameraError}</p>}
      {answer && !answer.ok && <p className="text-sm text-rose-400 minimal:text-rose-700 organised:text-rose-700 minimal:dark:text-rose-400 organised:dark:text-rose-400">{answer.error}</p>}
      {answer?.ok && !result && (
        <p className="text-sm text-muted-foreground">OpenLibrary doesn’t know that ISBN. Try searching by title.</p>
      )}
      {result && (
        <div role="listbox" aria-label="Book for that ISBN">
          <AddResultRow
            slug="books"
            result={result}
            row={rows.rows[key]}
            inLibrary={library[key] ?? (answer?.ok ? answer.mark : null)}
            onAdd={(status) => void rows.add(key, 'books', result, status)}
            onRate={(v) => {
              const r = rows.rows[key];
              if (r?.phase === 'rating') void rows.saveRating(key, r.activityId, v);
            }}
            onSkipRate={() => rows.setRow(key, { phase: 'done', rating: null })}
          />
        </div>
      )}
    </div>
  );
}
