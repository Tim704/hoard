// POST /api/ai/parse-list (spec 2.8): a pasted list (`text`, ≤ 20k chars) or
// one screenshot (`image`: PNG, JPEG or WebP ≤ 6 MB, checked by size and
// magic bytes) → Gemini → validated `[{title, year?, category?, rank?,
// score?}]`. A session is required (401). No key, a timeout or an answer that
// isn't a valid list is a friendly `{ ok: false, error }`, never a crash.

import { GoogleGenAI } from '@google/genai';

import {
  AI_MAX_IMAGE_BYTES,
  AI_MAX_TEXT,
  aiPrompt,
  aiResponseSchema,
  parseAiAnswer,
  sniffImage,
} from '@/lib/import/ai';
import { takeAiRate } from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** A slow image read is normal for the model; still bounded (spec G4). */
const AI_TIMEOUT_MS = 30_000;

/** The most body bytes read: one 6 MB image plus the multipart framing. */
const MAX_BODY_BYTES = AI_MAX_IMAGE_BYTES + 256 * 1024;

const TOO_LARGE = `That is too large. Paste up to ${AI_MAX_TEXT.toLocaleString('en')} characters, or an image up to 6 MB.`;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

/**
 * Read at most `max` bytes of the body, counting as it streams, so a lying
 * or missing Content-Length can't make the server buffer more. Null when the
 * body is larger.
 */
async function readCapped(req: Request, max: number): Promise<ArrayBuffer | null> {
  if (!req.body) return new ArrayBuffer(0);
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const out = new ArrayBuffer(total);
  const view = new Uint8Array(out);
  let at = 0;
  for (const p of parts) {
    view.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/**
 * Same-origin only: a cross-site form post must not spend the owner's key.
 * Behind the tunnel the Host / X-Forwarded-Host can differ from the public
 * name (see next.config.mjs), so the public URL's host counts as ours too.
 */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const ours = new Set<string>();
  for (const h of [req.headers.get('host'), req.headers.get('x-forwarded-host')]) if (h) ours.add(h);
  try {
    ours.add(new URL(process.env.HOARD_PUBLIC_URL || 'https://hoard.timhufnagel.org').host);
    return ours.has(new URL(origin).host);
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: 'Not signed in.' }, 401);
  if (!sameOrigin(req)) return json({ ok: false, error: 'Cross-site request refused.' }, 403);

  // Size first: a numeric Content-Length is required, and the read is capped
  // anyway (the header could lie).
  const lengthHeader = req.headers.get('content-length');
  if (!lengthHeader || !/^\d+$/.test(lengthHeader)) {
    return json({ ok: false, error: 'Send the list with a Content-Length.' }, 411);
  }
  if (Number(lengthHeader) > MAX_BODY_BYTES) return json({ ok: false, error: TOO_LARGE }, 413);
  const body = await readCapped(req, MAX_BODY_BYTES).catch(() => null);
  if (!body) return json({ ok: false, error: TOO_LARGE }, 413);

  let form: FormData;
  try {
    form = await new Response(body, { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData();
  } catch {
    return json({ ok: false, error: 'Send the list as a form (text or image).' }, 400);
  }
  const text = form.get('text');
  const image = form.get('image');

  let part: { text: string } | { inlineData: { mimeType: string; data: string } };
  let kind: 'text' | 'image';
  if (image && typeof image !== 'string') {
    if (image.size > AI_MAX_IMAGE_BYTES) return json({ ok: false, error: TOO_LARGE }, 413);
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (bytes.length > AI_MAX_IMAGE_BYTES) return json({ ok: false, error: TOO_LARGE }, 413);
    const mimeType = sniffImage(bytes);
    if (!mimeType) return json({ ok: false, error: 'Only PNG, JPEG and WebP images can be read.' }, 400);
    part = { inlineData: { mimeType, data: Buffer.from(bytes).toString('base64') } };
    kind = 'image';
  } else if (typeof text === 'string' && text.trim()) {
    if (text.length > AI_MAX_TEXT) return json({ ok: false, error: TOO_LARGE }, 413);
    part = { text: text.trim() };
    kind = 'text';
  } else {
    return json({ ok: false, error: 'Paste some text or choose an image first.' }, 400);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ ok: false, error: "The AI reader isn't configured on this server. Ask the owner to add GEMINI_API_KEY." }, 503);
  }

  // Registration is open: each user gets a share of the owner's AI quota.
  const rate = takeAiRate(user.id);
  if (!rate.ok) return json({ ok: false, error: rate.message }, 429, { 'Retry-After': String(rate.retryAfterSec) });

  let answer: string | undefined;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const resp = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: aiPrompt(kind) }, part] }],
      config: {
        responseMimeType: 'application/json',
        // The SDK's Schema type wants its own enum; the plain strings are the same values.
        responseSchema: aiResponseSchema() as never,
        temperature: 0,
        abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
      },
    });
    answer = resp.text;
  } catch (err) {
    console.error('[ai/parse-list] Gemini failed:', err instanceof Error ? err.message : err);
    return json({ ok: false, error: 'The AI reader is unavailable right now. Try again later.' }, 502);
  }

  const parsed = parseAiAnswer(answer);
  if (!parsed.ok) return json(parsed, 422);
  return json({ ok: true, items: parsed.items });
}
