import { describe, expect, it, vi } from 'vitest';

import { discordContent, encodeHeader, pushAll, shouldPush, type FetchLike } from './notify-push';

const msg = { title: 'Backup is stale', body: 'The newest backup is 30 h old.', url: 'https://hoard.example/settings' };

function okFetch(status = 200) {
  return vi.fn<FetchLike>(async () => new Response(null, { status }));
}

describe('encodeHeader', () => {
  it('keeps ASCII and encodes the rest as RFC 2047', () => {
    expect(encodeHeader('Hello')).toBe('Hello');
    expect(encodeHeader('a\nb')).toBe('a b');
    const enc = encodeHeader('進撃の巨人');
    expect(enc).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
    expect(Buffer.from(enc.slice(10, -2), 'base64').toString('utf8')).toBe('進撃の巨人');
  });
});

describe('discordContent', () => {
  it('formats and caps at 2000 characters', () => {
    expect(discordContent(msg)).toBe('**Backup is stale**\nThe newest backup is 30 h old.\nhttps://hoard.example/settings');
    expect(discordContent({ title: 't', body: 'x'.repeat(5000) })).toHaveLength(2000);
  });
});

describe('pushAll', () => {
  it('does nothing without targets', async () => {
    const f = okFetch();
    expect(await pushAll({ ntfyUrl: null, discordWebhook: null }, msg, f)).toEqual({ sent: [], error: null });
    expect(f).not.toHaveBeenCalled();
  });

  it('posts plain text to ntfy with Title and Click headers', async () => {
    const f = okFetch();
    const out = await pushAll({ ntfyUrl: 'https://ntfy.sh/topic', discordWebhook: null }, msg, f);
    expect(out).toEqual({ sent: ['ntfy'], error: null });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://ntfy.sh/topic');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(msg.body);
    expect(init.headers).toMatchObject({ Title: 'Backup is stale', Click: msg.url });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('posts JSON content to Discord', async () => {
    const f = okFetch(204);
    const out = await pushAll({ ntfyUrl: null, discordWebhook: 'https://discord.com/api/webhooks/1/abc' }, msg, f);
    expect(out).toEqual({ sent: ['discord'], error: null });
    const body = JSON.parse(String(f.mock.calls[0][1].body));
    expect(body.content).toContain('**Backup is stale**');
  });

  it('records failures instead of throwing', async () => {
    const f = vi.fn<FetchLike>(async (url) => {
      if (url.includes('ntfy')) throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
      return new Response('nope', { status: 500 });
    });
    const out = await pushAll(
      { ntfyUrl: 'https://ntfy.sh/topic', discordWebhook: 'https://discord.com/api/webhooks/1/abc' },
      msg,
      f,
    );
    expect(out.sent).toEqual([]);
    expect(out.error).toBe('ntfy: Timed out; discord: HTTP 500');
  });

  it('collapses connection errors to a generic message (no host/port details)', async () => {
    const f = vi.fn<FetchLike>(async () => {
      throw new TypeError('fetch failed: connect ECONNREFUSED 203.0.113.5:8443');
    });
    const out = await pushAll({ ntfyUrl: 'https://ntfy.example.org/t', discordWebhook: null }, msg, f);
    expect(out.error).toBe('ntfy: Could not connect');
  });

  it('skips non-https and private targets', async () => {
    const f = okFetch();
    await pushAll({ ntfyUrl: 'http://ntfy.sh/topic', discordWebhook: 'https://192.168.1.5/hook' }, msg, f);
    await pushAll({ ntfyUrl: 'https://localhost/topic', discordWebhook: 'https://[::1]/hook' }, msg, f);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('shouldPush', () => {
  it('treats an empty list as every kind and always sends tests', () => {
    expect(shouldPush([], 'releases')).toBe(true);
    expect(shouldPush(['backup'], 'releases')).toBe(false);
    expect(shouldPush(['backup'], 'backup')).toBe(true);
    expect(shouldPush(['backup'], 'test')).toBe(true);
  });
});
