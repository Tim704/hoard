'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Settings → Accounts (spec 8.1–8.3): link Steam, Last.fm and AniList, run
//  their syncs now, and the Last.fm "Mark as Listened?" suggestions. Every
//  action authenticates and only touches the caller's own link. Provider keys
//  and OAuth tokens never leave the server; results carry `PublicLink`s.
// ───────────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { fetchLastfmUser, lastfmConfigured } from '@/lib/apis/music';
import { getOwnedGames, playerSummary, resolveVanity, STEAM_NOT_CONFIGURED, steamConfigured } from '@/lib/apis/steam';
import { authorizeUrl } from '@/lib/anilist-sync';
import { aniListPushConfigured, pullAniListForUser } from '@/lib/anilist-sync-server';
import { changePrefs, getPrefs } from '@/lib/data-prefs';
import {
  deleteLink,
  getLink,
  linkData,
  patchLinkData,
  publicLink,
  recordSync,
  saveLink,
  type PublicLink,
} from '@/lib/external-links';
import { mapSteamOwnedGames, parseSteamInput, steamGamesProblem } from '@/lib/import/sources/steam';
import { validAniListUser } from '@/lib/import/sources/anilist';
import { sameAniListName } from '@/lib/anilist-sync';
import { MAX_IMPORT_ROWS, type ImportRow } from '@/lib/import/types';
import { checkLastfmForUser } from '@/lib/jobs/lastfm';
import { syncSteamForUser } from '@/lib/jobs/steam';
import { suggestedIds } from '@/lib/lastfm-suggest';
import { oauthStates } from '@/lib/oauth-state';
import { publicBaseUrl } from '@/lib/public-url';
import { takeRate, type RateLimits } from '@/lib/rate-limit';
import { SESSION_COOKIE, requireUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

type LinkResult = ActionResult & { account?: PublicLink | null; notice?: string };

const fail = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** "Sync now" buttons: a few a minute, a couple of dozen a day. */
const SYNC_NOW_LIMITS: RateLimits = { perMinute: 2, perDay: 20 };
/** Connecting (each one looks the account up): modest. */
const CONNECT_LIMITS: RateLimits = { perMinute: 5, perDay: 50 };

function rate(key: string, limits: RateLimits): string | null {
  const d = takeRate(key, limits);
  return d.ok ? null : d.message;
}

const revalidateSettings = () => revalidatePath('/settings');

// ── Steam (8.1) ────────────────────────────────────────────────────────────

/** Link a Steam account from a profile link, vanity name or SteamID64. */
export async function connectSteam(input: string): Promise<LinkResult> {
  try {
    const user = await requireUser();
    if (!steamConfigured()) return { ok: false, error: STEAM_NOT_CONFIGURED };
    const parsed = parseSteamInput(typeof input === 'string' ? input : '');
    if (!parsed) return { ok: false, error: 'Paste your Steam profile link, your custom URL name or your SteamID64.' };
    const limited = rate(`connect:steam:${user.id}`, CONNECT_LIMITS);
    if (limited) return { ok: false, error: limited };

    const steamId = parsed.kind === 'id' ? parsed.steamId : await resolveVanity(parsed.vanity);
    if (!steamId) return { ok: false, error: `Steam has no profile called "${parsed.kind === 'vanity' ? parsed.vanity : input}".` };
    const summary = await playerSummary(steamId);
    if (!summary) return { ok: false, error: 'Steam has no profile with that id.' };

    await saveLink(user.id, 'steam', { accountId: steamId, data: { name: summary.name } });
    await changePrefs(user.id, (p) => ({ ...p, steamId }));
    revalidateSettings();
    return { ok: true, account: publicLink(await getLink(user.id, 'steam')) };
  } catch (err) {
    return { ok: false, error: fail(err, 'Could not link that Steam account.') };
  }
}

export async function disconnectSteam(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await deleteLink(user.id, 'steam');
    await changePrefs(user.id, (p) => (p.steamId === null ? null : { ...p, steamId: null }));
    revalidateSettings();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: fail(err, 'Could not unlink Steam.') };
  }
}

/** The linked account's games as import rows, for the review screen. */
export async function fetchSteamRows(): Promise<{
  ok: boolean;
  error?: string;
  rows?: ImportRow[];
  skipped?: number;
  cut?: number;
}> {
  try {
    const user = await requireUser();
    if (!steamConfigured()) return { ok: false, error: STEAM_NOT_CONFIGURED };
    const link = await getLink(user.id, 'steam');
    if (!link) return { ok: false, error: 'Link your Steam account first (Settings → Accounts).' };
    const limited = rate(`steam-games:${user.id}`, CONNECT_LIMITS);
    if (limited) return { ok: false, error: limited };
    const json = await getOwnedGames(link.accountId);
    const problem = steamGamesProblem(json);
    if (problem) return { ok: false, error: problem };
    const mapped = mapSteamOwnedGames(json);
    return {
      ok: true,
      rows: mapped.rows.slice(0, MAX_IMPORT_ROWS),
      skipped: mapped.skipped,
      cut: Math.max(0, mapped.rows.length - MAX_IMPORT_ROWS),
    };
  } catch (err) {
    return { ok: false, error: fail(err, 'Could not read your Steam games.') };
  }
}

/** Refresh the playtime of the user's matched games now. */
export async function syncSteamNow(): Promise<ActionResult & { changed?: number }> {
  try {
    const user = await requireUser();
    if (!steamConfigured()) return { ok: false, error: STEAM_NOT_CONFIGURED };
    const link = await getLink(user.id, 'steam');
    if (!link) return { ok: false, error: 'Link your Steam account first.' };
    const limited = rate(`sync:steam:${user.id}`, SYNC_NOW_LIMITS);
    if (limited) return { ok: false, error: limited };
    try {
      const changed = await syncSteamForUser(user.id, link.accountId);
      await recordSync(user.id, 'steam', null);
      revalidatePath('/games');
      return { ok: true, changed };
    } catch (err) {
      const message = fail(err, 'Steam sync failed.');
      await recordSync(user.id, 'steam', message);
      return { ok: false, error: message };
    }
  } catch (err) {
    return { ok: false, error: fail(err, 'Steam sync failed.') };
  }
}

// ── Last.fm (8.3) ──────────────────────────────────────────────────────────

/** Last.fm user names: 2–15 characters, a letter first, then letters, digits, _ or -. */
const LastfmName = z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]{1,14}$/);

export async function connectLastfm(username: string): Promise<LinkResult> {
  try {
    const user = await requireUser();
    if (!lastfmConfigured()) {
      return { ok: false, error: "Last.fm isn't configured on this server. Ask the owner to add LASTFM_API_KEY." };
    }
    const parsed = LastfmName.safeParse(username);
    if (!parsed.success) return { ok: false, error: 'That is not a Last.fm username.' };
    const limited = rate(`connect:lastfm:${user.id}`, CONNECT_LIMITS);
    if (limited) return { ok: false, error: limited };
    const name = await fetchLastfmUser(parsed.data);
    if (!name) return { ok: false, error: `Last.fm has no user called "${parsed.data}".` };
    await saveLink(user.id, 'lastfm', { accountId: name, data: {} });
    await changePrefs(user.id, (p) => ({ ...p, lastfmUser: name }));
    revalidateSettings();
    return { ok: true, account: publicLink(await getLink(user.id, 'lastfm')) };
  } catch (err) {
    return { ok: false, error: fail(err, 'Could not link that Last.fm account.') };
  }
}

export async function disconnectLastfm(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await deleteLink(user.id, 'lastfm');
    await changePrefs(user.id, (p) => (p.lastfmUser === null ? null : { ...p, lastfmUser: null }));
    revalidateSettings();
    revalidatePath('/music');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: fail(err, 'Could not unlink Last.fm.') };
  }
}

export async function checkLastfmNow(): Promise<ActionResult & { suggested?: number; checked?: number }> {
  try {
    const user = await requireUser();
    if (!lastfmConfigured()) return { ok: false, error: "Last.fm isn't configured on this server." };
    const link = await getLink(user.id, 'lastfm');
    if (!link) return { ok: false, error: 'Link your Last.fm account first.' };
    const limited = rate(`sync:lastfm:${user.id}`, SYNC_NOW_LIMITS);
    if (limited) return { ok: false, error: limited };
    try {
      const res = await checkLastfmForUser(user.id, link.accountId, 100, linkData(link));
      await recordSync(user.id, 'lastfm', null);
      revalidatePath('/music');
      return { ok: true, ...res };
    } catch (err) {
      const message = fail(err, 'Last.fm check failed.');
      await recordSync(user.id, 'lastfm', message);
      return { ok: false, error: message };
    }
  } catch (err) {
    return { ok: false, error: fail(err, 'Last.fm check failed.') };
  }
}

/**
 * Clear an album's "Mark as Listened?" badge: after marking it (`dismiss`
 * false) or when the user says no (`dismiss` true: never suggested again).
 */
export async function clearListenSuggestion(activityId: string, dismiss: boolean): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = typeof activityId === 'string' ? activityId.slice(0, 64) : '';
    if (!id) return { ok: false, error: 'Not found.' };
    await patchLinkData(user.id, 'lastfm', (d) => {
      const suggested = suggestedIds(d).filter((x) => x !== id);
      const dismissed = suggestedIds({ suggested: d.dismissed });
      return {
        ...d,
        suggested,
        ...(dismiss ? { dismissed: [...dismissed.filter((x) => x !== id), id].slice(-500) } : {}),
      };
    });
    revalidatePath('/music');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: fail(err, 'Could not clear that.') };
  }
}

// ── AniList (8.2) ──────────────────────────────────────────────────────────

/** Set (or clear, with an empty name) the AniList user the nightly pull reads. */
export async function setAniListUser(username: string | null): Promise<LinkResult> {
  try {
    const user = await requireUser();
    const name = typeof username === 'string' ? username.trim() : '';
    if (name && !validAniListUser(name)) return { ok: false, error: 'That is not an AniList username.' };
    const limited = rate(`connect:anilist-user:${user.id}`, CONNECT_LIMITS);
    if (limited) return { ok: false, error: limited };
    await changePrefs(user.id, (p) => ({ ...p, anilistUser: name || null }));
    const link = await getLink(user.id, 'anilist');
    let notice: string | undefined;
    if (name) {
      // Pull and push must target the same account: another name than the
      // connected (OAuth) one ends the push connection.
      const viewer = linkData(link).viewerName;
      const otherAccount = Boolean(link?.token) && typeof viewer === 'string' && !sameAniListName(viewer, name);
      if (otherAccount) notice = `Pushing to ${viewer} was turned off: connect again to push to ${name}.`;
      await prisma.externalLink.upsert({
        where: { userId_provider: { userId: user.id, provider: 'anilist' } },
        create: { userId: user.id, provider: 'anilist', accountId: name, data: {} },
        update: { accountId: name, ...(otherAccount ? { token: null } : {}) },
      });
    } else if (link && !link.token) {
      await deleteLink(user.id, 'anilist');
    }
    revalidateSettings();
    return { ok: true, notice, account: publicLink(await getLink(user.id, 'anilist')) };
  } catch (err) {
    return { ok: false, error: fail(err, 'Could not save the AniList username.') };
  }
}

/** Pull the user's AniList lists now (update existing, never removing). */
export async function syncAniListNow(): Promise<
  ActionResult & { added?: number; updated?: number; failed?: number; skipped?: number }
> {
  try {
    const user = await requireUser();
    const name = (await getPrefs(user.id)).anilistUser;
    if (!name || !validAniListUser(name)) return { ok: false, error: 'Save your AniList username first.' };
    const limited = rate(`sync:anilist:${user.id}`, SYNC_NOW_LIMITS);
    if (limited) return { ok: false, error: limited };
    try {
      const tally = await pullAniListForUser(user.id, name);
      await recordSync(user.id, 'anilist', null);
      revalidatePath('/', 'layout');
      return { ok: true, added: tally.added, updated: tally.updated, failed: tally.failed, skipped: tally.skipped };
    } catch (err) {
      const message = fail(err, 'AniList sync failed.');
      await recordSync(user.id, 'anilist', message);
      return { ok: false, error: message };
    }
  } catch (err) {
    return { ok: false, error: fail(err, 'AniList sync failed.') };
  }
}

/** The AniList OAuth redirect URL registered with the client (spec 8.2). */
export async function aniListRedirectUri(): Promise<string> {
  return `${publicBaseUrl()}/api/oauth/anilist`;
}

/** Start connecting AniList for the push: the authorize URL to open. */
export async function startAniListConnect(): Promise<ActionResult & { url?: string }> {
  try {
    const user = await requireUser();
    if (!aniListPushConfigured()) {
      return {
        ok: false,
        error: "AniList push isn't configured on this server (ANILIST_CLIENT_ID, ANILIST_CLIENT_SECRET and HOARD_SECRET).",
      };
    }
    const session = cookies().get(SESSION_COOKIE)?.value;
    if (!session) return { ok: false, error: 'Sign in again, then try once more.' };
    const limited = rate(`connect:anilist:${user.id}`, CONNECT_LIMITS);
    if (limited) return { ok: false, error: limited };
    const state = oauthStates.issue({ session, userId: user.id, provider: 'anilist' });
    return { ok: true, url: authorizeUrl(process.env.ANILIST_CLIENT_ID!, await aniListRedirectUri(), state) };
  } catch (err) {
    return { ok: false, error: fail(err, 'Could not start connecting AniList.') };
  }
}

/** Forget the AniList connection (token included); the pull username goes too. */
export async function disconnectAniList(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await deleteLink(user.id, 'anilist');
    await changePrefs(user.id, (p) => (p.anilistUser === null ? null : { ...p, anilistUser: null }));
    revalidateSettings();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: fail(err, 'Could not disconnect AniList.') };
  }
}
