// Reading a request body with a hard size cap (route handlers). Server-only
// in practice, but pure Web APIs, so it is tested with plain Requests.

/**
 * Read at most `max` bytes of the body, counting as it streams, so a lying
 * or missing Content-Length can't make the server buffer more. Null when the
 * body is larger.
 */
export async function readCapped(req: Request, max: number): Promise<ArrayBuffer | null> {
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
