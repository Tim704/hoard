import { NextResponse, type NextRequest } from 'next/server';

import {
  allowedImageUrl,
  IMG_MAX_BYTES,
  IMG_MAX_REDIRECTS,
  IMG_TIMEOUT_MS,
  isAllowedImageType,
} from '@/lib/img-proxy';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const fail = (status: number) => new NextResponse(null, { status, headers: { 'cache-control': 'no-store' } });

/**
 * GET /api/img?u=<cover url> — a same-origin copy of a provider cover, so the
 * tier list PNG export can draw it on a canvas (spec 4.1). Signed-in users
 * only; only the allow-listed CDNs (src/lib/img-proxy.ts), each redirect hop
 * checked again; raster images up to 5 MB within 8 s.
 */
export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return fail(401);

  const first = allowedImageUrl(req.nextUrl.searchParams.get('u'));
  if (!first) return fail(400);
  let url: URL = first;

  const signal = AbortSignal.timeout(IMG_TIMEOUT_MS);
  try {
    let res: Response;
    for (let hops = 0; ; hops++) {
      res = await fetch(url, { redirect: 'manual', signal, headers: { accept: 'image/*' }, cache: 'no-store' });
      if (res.status < 300 || res.status >= 400) break;
      const next: URL | null = hops < IMG_MAX_REDIRECTS ? allowedImageUrl(resolveLocation(url, res.headers.get('location'))) : null;
      if (!next) return fail(502);
      url = next;
    }
    if (!res.ok || !res.body) return fail(502);
    const type = res.headers.get('content-type');
    if (!isAllowedImageType(type)) return fail(415);
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > IMG_MAX_BYTES) return fail(413);

    const body = await readCapped(res.body, IMG_MAX_BYTES);
    if (!body) return fail(413);
    return new NextResponse(body as BodyInit, {
      status: 200,
      headers: {
        'content-type': type!.split(';')[0].trim().toLowerCase(),
        'content-length': String(body.byteLength),
        // private: the route needs a session, so shared caches must not keep it.
        'cache-control': 'private, max-age=86400',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return fail(504);
  }
}

function resolveLocation(base: URL, location: string | null): string | null {
  if (!location) return null;
  try {
    return new URL(location, base).toString();
  } catch {
    return null;
  }
}

/** The whole body, or null once it passes `max` bytes. */
async function readCapped(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}
