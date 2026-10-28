import { describe, expect, it } from 'vitest';

import { readCapped } from './http-body';

/** A POST whose body arrives in chunks, with no Content-Length (as a tunnel may forward it). */
function chunked(sizes: number[]): Request {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const n of sizes) c.enqueue(new Uint8Array(n).fill(65));
      c.close();
    },
  });
  return new Request('http://x/', { method: 'POST', body, duplex: 'half' } as RequestInit);
}

describe('readCapped', () => {
  it('reads a chunked body without Content-Length up to the cap', async () => {
    const req = chunked([400, 400, 200]);
    expect(req.headers.get('content-length')).toBeNull();
    const buf = await readCapped(req, 1000);
    expect(buf?.byteLength).toBe(1000);
  });

  it('stops as soon as the body passes the cap', async () => {
    expect(await readCapped(chunked([600, 600, 600]), 1000)).toBeNull();
  });

  it('gives an empty buffer for no body, and the bytes intact otherwise', async () => {
    expect((await readCapped(new Request('http://x/', { method: 'POST' }), 10))?.byteLength).toBe(0);
    const buf = await readCapped(new Request('http://x/', { method: 'POST', body: 'héllo' }), 10);
    expect(new TextDecoder().decode(buf!)).toBe('héllo');
  });
});
