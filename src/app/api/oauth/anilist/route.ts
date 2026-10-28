// ───────────────────────────────────────────────────────────────────────────
//  AniList OAuth callback (spec 8.2): `${HOARD_PUBLIC_URL}/api/oauth/anilist`.
//  Accepts only a `state` issued to this browser's session in the last 10
//  minutes (src/lib/oauth-state.ts), exchanges the code server-side, and
//  stores the token sealed (src/lib/secret-box.ts) on the user's AniList
//  link. Every outcome redirects back to Settings → Accounts with a short
//  status in the query; nothing secret is ever put in a URL or a log.
// ───────────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { prisma } from '@/lib/prisma';
import { anilistGraphql } from '@/lib/apis/anilist';
import { providerFetch } from '@/lib/apis/http';
import { ANILIST_TOKEN_URL } from '@/lib/anilist-sync';
import { aniListPushConfigured } from '@/lib/anilist-sync-server';
import { changePrefs } from '@/lib/data-prefs';
import { oauthStates } from '@/lib/oauth-state';
import { publicBaseUrl } from '@/lib/public-url';
import { sealToken } from '@/lib/secret-box';
import { getCurrentUser, SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

const back = (status: string) =>
  NextResponse.redirect(new URL(`/settings?anilist=${encodeURIComponent(status)}#accounts`, publicBaseUrl()), 303);

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const user = await getCurrentUser();
  if (!user) return back('signed-out');
  const check = oauthStates.consume(params.get('state'), {
    session: cookies().get(SESSION_COOKIE)?.value,
    provider: 'anilist',
  });
  if (!check.ok || check.userId !== user.id) return back('expired');
  if (params.get('error')) return back('denied');
  const code = params.get('code');
  if (!code || code.length > 4000) return back('failed');
  if (!aniListPushConfigured()) return back('not-configured');

  try {
    const res = await providerFetch(ANILIST_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.ANILIST_CLIENT_ID,
        client_secret: process.env.ANILIST_CLIENT_SECRET,
        redirect_uri: `${publicBaseUrl()}/api/oauth/anilist`,
        code,
      }),
    });
    const json = (await res.json().catch(() => null)) as { access_token?: unknown } | null;
    const token = typeof json?.access_token === 'string' ? json.access_token : null;
    if (!res.ok || !token) return back('failed');

    const viewer = await anilistGraphql<{ Viewer: { id: number; name: string } | null }>(
      'query { Viewer { id name } }',
      {},
      'AniList viewer',
      token,
    );
    const name = viewer.data?.Viewer?.name;
    if (!name) return back('failed');

    const sealed = sealToken(token);
    await prisma.externalLink.upsert({
      where: { userId_provider: { userId: user.id, provider: 'anilist' } },
      create: { userId: user.id, provider: 'anilist', accountId: name, token: sealed, data: { name } },
      update: { accountId: name, token: sealed, data: { name } },
    });
    // The pull reads the same account unless another name was chosen.
    await changePrefs(user.id, (p) => (p.anilistUser ? null : { ...p, anilistUser: name }));
    return back('connected');
  } catch {
    return back('failed');
  }
}
