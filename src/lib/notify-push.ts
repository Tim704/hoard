// ───────────────────────────────────────────────────────────────────────────
//  Pushing a notification to the user's own ntfy topic and Discord webhook.
//  No database access; `fetch` is injectable so tests never hit the network.
//
//  - ntfy: POST the body as plain text to the full topic URL, with the title
//    in the `Title` header (RFC 2047-encoded when not plain ASCII, which ntfy
//    decodes) and the link in `Click`.
//  - Discord: POST JSON `{ content }` (at most 2000 characters); 204 = sent.
//
//  Every push has a 5 s timeout and never throws: it resolves to an error
//  string (or null on success). Errors are collapsed to generic categories
//  ("Could not connect", "Timed out", "HTTP <status>") so they can't be used
//  to probe which hosts and ports the server can reach. Targets are checked
//  again here with the same rules as the settings form (url-safety.ts).
// ───────────────────────────────────────────────────────────────────────────

import { isAllowedPushUrl } from '@/lib/url-safety';

export interface PushMessage {
  title: string;
  body: string;
  /** Absolute URL to open, if any. */
  url?: string | null;
}

export interface PushTargets {
  ntfyUrl: string | null;
  discordWebhook: string | null;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export const PUSH_TIMEOUT_MS = 5_000;
const DISCORD_LIMIT = 2000;

/** Encode a header value as RFC 2047 base64 when it has non-ASCII characters. */
export function encodeHeader(value: string): string {
  const flat = value.replace(/[\r\n]+/g, ' ').trim();
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(flat)) return flat;
  return `=?UTF-8?B?${Buffer.from(flat, 'utf8').toString('base64')}?=`;
}

/** The Discord message text: bold title, body, link; cut to Discord's limit. */
export function discordContent(msg: PushMessage): string {
  const text = [`**${msg.title}**`, msg.body, msg.url ?? ''].filter(Boolean).join('\n');
  return text.length > DISCORD_LIMIT ? `${text.slice(0, DISCORD_LIMIT - 1)}…` : text;
}

async function post(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<string | null> {
  try {
    const res = await fetchImpl(url, {
      ...init,
      method: 'POST',
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
      redirect: 'error',
    });
    return res.ok ? null : `HTTP ${res.status}`;
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return 'Timed out';
    }
    return 'Could not connect';
  }
}

export function pushNtfy(fetchImpl: FetchLike, url: string, msg: PushMessage) {
  const headers: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    Title: encodeHeader(msg.title),
  };
  if (msg.url) headers.Click = msg.url;
  return post(fetchImpl, url, { headers, body: msg.body });
}

export function pushDiscord(fetchImpl: FetchLike, url: string, msg: PushMessage) {
  return post(fetchImpl, url, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: discordContent(msg), allowed_mentions: { parse: [] } }),
  });
}

export interface PushOutcome {
  /** Targets that accepted the message. */
  sent: ('ntfy' | 'discord')[];
  /** "ntfy: HTTP 500; discord: Timed out", or null when nothing failed. */
  error: string | null;
}

/** Push to every configured, allowed target in parallel. Never throws. */
export async function pushAll(
  targets: PushTargets,
  msg: PushMessage,
  fetchImpl: FetchLike = fetch,
): Promise<PushOutcome> {
  const jobs: Promise<['ntfy' | 'discord', string | null]>[] = [];
  if (isAllowedPushUrl(targets.ntfyUrl)) {
    jobs.push(pushNtfy(fetchImpl, targets.ntfyUrl, msg).then((e) => ['ntfy', e]));
  }
  if (isAllowedPushUrl(targets.discordWebhook)) {
    jobs.push(pushDiscord(fetchImpl, targets.discordWebhook, msg).then((e) => ['discord', e]));
  }
  const results = await Promise.all(jobs);
  const sent = results.filter(([, e]) => e === null).map(([t]) => t);
  const errors = results.filter(([, e]) => e !== null).map(([t, e]) => `${t}: ${e}`);
  return { sent, error: errors.length ? errors.join('; ') : null };
}

/** Whether a kind is pushed: an empty list means every kind; tests always go. */
export function shouldPush(kinds: readonly string[], kind: string): boolean {
  return kind === 'test' || kinds.length === 0 || kinds.includes(kind);
}
