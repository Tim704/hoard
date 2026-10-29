'use client';

// ───────────────────────────────────────────────────────────────────────────
//  Settings → Accounts (spec 8.1–8.3): link Steam (import + nightly
//  playtime), Last.fm ("Mark as Listened?" suggestions) and AniList (nightly
//  pull, and push once connected through OAuth). Without a provider's key
//  each section says what the owner has to add; nothing here ever sees a key
//  or token.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Download, Link2, Link2Off, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { FoldedAction } from '@/components/folded-action';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { settle } from '@/lib/action-result';
import {
  checkLastfmNow,
  connectLastfm,
  connectSteam,
  disconnectAniList,
  disconnectLastfm,
  disconnectSteam,
  setAniListUser,
  startAniListConnect,
  syncAniListNow,
  syncSteamNow,
} from '@/lib/actions/accounts';
import type { PublicLink } from '@/lib/external-links';
import { settingsHref } from '@/lib/settings-nav';

export interface AccountsProps {
  steam: { configured: boolean; link: PublicLink | null };
  lastfm: { configured: boolean; link: PublicLink | null };
  anilist: {
    username: string | null;
    link: PublicLink | null;
    pushConfigured: boolean;
    redirectUri: string;
  };
}

const OAUTH_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'AniList connected. Your changes to anime and manga now go to AniList too.' },
  denied: { ok: false, text: 'AniList connection cancelled.' },
  expired: { ok: false, text: 'That AniList connection link expired or belongs to another session. Try again.' },
  failed: { ok: false, text: "AniList didn't accept the connection. Try again." },
  'not-configured': { ok: false, text: "AniList push isn't configured on this server." },
  'signed-out': { ok: false, text: 'Sign in, then connect AniList again.' },
};

export function SettingsAccounts({ steam, lastfm, anilist }: AccountsProps) {
  const router = useRouter();
  const params = useSearchParams();

  // The OAuth callback comes back with ?anilist=<status>: say it once.
  useEffect(() => {
    const status = params.get('anilist');
    const msg = status ? OAUTH_MESSAGES[status] : null;
    if (!msg) return;
    if (msg.ok) toast.success(msg.text);
    else toast.error(msg.text);
    router.replace(settingsHref('accounts'), { scroll: false });
  }, [params, router]);

  return (
    <Card id="accounts" className="scroll-mt-bar">
      <CardHeader>
        <CardTitle className="text-base">Accounts</CardTitle>
        <CardDescription>Link other sites so Hoard can import from them and keep up with them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <SteamSection {...steam} />
        <Separator />
        <LastfmSection {...lastfm} />
        <Separator />
        <AniListSection {...anilist} />
      </CardContent>
    </Card>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function SyncState({ link }: { link: PublicLink }) {
  if (link.lastError) {
    return <p className="text-xs text-rose-700 dark:text-rose-300">Last sync: {link.lastError}</p>;
  }
  if (link.lastSyncAt) {
    return (
      <p className="text-xs text-muted-foreground">
        Last synced {new Date(link.lastSyncAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
    );
  }
  return null;
}

function AccountForm({
  label,
  placeholder,
  disabled,
  pending,
  action,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  disabled: boolean;
  pending: boolean;
  action: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        className="h-9 min-w-0"
        disabled={disabled}
      />
      <Button type="submit" size="sm" className="h-9 shrink-0" disabled={disabled || pending || !value.trim()}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="mr-2 h-4 w-4" aria-hidden />}
        {action}
      </Button>
    </form>
  );
}

// ── Steam ──────────────────────────────────────────────────────────────────

function SteamSection({ configured, link: initial }: AccountsProps['steam']) {
  const [link, setLink] = useState(initial);
  const [pending, start] = useTransition();

  const connect = (input: string) =>
    start(async () => {
      const res = await settle(connectSteam(input));
      if (res.ok && res.account) {
        setLink(res.account);
        toast.success(`Steam linked: ${res.account.name ?? res.account.accountId}.`);
      } else toast.error(res.error ?? 'Could not link Steam.');
    });
  const disconnect = () =>
    start(async () => {
      const res = await settle(disconnectSteam());
      if (res.ok) {
        setLink(null);
        toast.success('Steam unlinked. Playtimes already saved stay.');
      } else toast.error(res.error ?? 'Could not unlink Steam.');
    });
  const sync = () =>
    start(async () => {
      const res = await settle(syncSteamNow());
      if (res.ok) toast.success(res.changed ? `Updated the playtime of ${res.changed} game${res.changed === 1 ? '' : 's'}.` : 'Playtimes are up to date.');
      else toast.error(res.error ?? 'Steam sync failed.');
    });

  return (
    <section className="space-y-2" aria-labelledby="acc-steam">
      <h3 id="acc-steam" className="text-sm font-semibold">Steam</h3>
      <p className="text-sm text-muted-foreground">
        Import your Steam library (played games as Playing, the rest as Unplayed; nothing is marked Beaten) and keep each
        game&apos;s playtime current every night.
      </p>
      {!configured ? (
        <Missing>Steam isn&apos;t configured on this server. Ask the owner to add a Steam Web API key (STEAM_API_KEY).</Missing>
      ) : link ? (
        <div className="space-y-2">
          <p className="text-sm">
            Linked to <span className="font-medium">{link.name ?? link.accountId}</span>
            <span className="text-muted-foreground"> · {link.accountId}</span>
          </p>
          <SyncState link={link} />
          {/* Phones: full-width buttons, one per line; one row from sm, with
              Unlink in a menu so the row fits beside the sidebar. */}
          <div data-actions="" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
              <Link href="/import?source=steam">
                <Download className="mr-2 h-4 w-4" aria-hidden />
                Import library
              </Link>
            </Button>
            <Button size="sm" variant="outline" onClick={sync} disabled={pending} className="w-full sm:w-auto">
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              Update playtime now
            </Button>
            <FoldedAction fold="sm" menuLabel="More Steam actions" label="Unlink" onSelect={disconnect} disabled={pending} />
          </div>
        </div>
      ) : (
        <>
          <AccountForm
            label="Steam profile"
            placeholder="Profile link, custom URL name or SteamID64"
            disabled={pending}
            pending={pending}
            action="Link"
            onSubmit={connect}
          />
          <p className="text-xs text-muted-foreground">
            Your profile&apos;s &quot;Game details&quot; must be Public (Steam → Edit Profile → Privacy Settings).
          </p>
        </>
      )}
    </section>
  );
}

// ── Last.fm ────────────────────────────────────────────────────────────────

function LastfmSection({ configured, link: initial }: AccountsProps['lastfm']) {
  const [link, setLink] = useState(initial);
  const [pending, start] = useTransition();

  const connect = (name: string) =>
    start(async () => {
      const res = await settle(connectLastfm(name));
      if (res.ok && res.account) {
        setLink(res.account);
        toast.success(`Last.fm linked: ${res.account.accountId}.`);
      } else toast.error(res.error ?? 'Could not link Last.fm.');
    });
  const disconnect = () =>
    start(async () => {
      const res = await settle(disconnectLastfm());
      if (res.ok) {
        setLink(null);
        toast.success('Last.fm unlinked.');
      } else toast.error(res.error ?? 'Could not unlink Last.fm.');
    });
  const check = () =>
    start(async () => {
      const res = await settle(checkLastfmNow());
      if (res.ok) {
        toast.success(
          res.suggested
            ? `${res.suggested} album${res.suggested === 1 ? '' : 's'} to mark as listened, see Music.`
            : `Checked ${res.checked ?? 0} album${res.checked === 1 ? '' : 's'}; nothing new to suggest.`,
        );
      } else toast.error(res.error ?? 'Last.fm check failed.');
    });

  return (
    <section className="space-y-2" aria-labelledby="acc-lastfm">
      <h3 id="acc-lastfm" className="text-sm font-semibold">Last.fm</h3>
      <p className="text-sm text-muted-foreground">
        Each night your Planned and Ongoing albums are checked against your scrobbles. Once you&apos;ve played 80 % of an
        album&apos;s tracks, Hoard suggests &quot;Mark as Listened?&quot;. It never changes anything by itself.
      </p>
      {!configured ? (
        <Missing>Last.fm isn&apos;t configured on this server. Ask the owner to add LASTFM_API_KEY.</Missing>
      ) : link ? (
        <div className="space-y-2">
          <p className="text-sm">
            Linked to <span className="font-medium">{link.accountId}</span>
          </p>
          <SyncState link={link} />
          {/* Phones: full-width buttons, one per line; one row from sm. */}
          <div data-actions="" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button size="sm" variant="outline" onClick={check} disabled={pending} className="w-full sm:w-auto">
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              Check now
            </Button>
            <Button size="sm" variant="outline" onClick={disconnect} disabled={pending} className="w-full sm:w-auto">
              <Link2Off className="mr-2 h-4 w-4" aria-hidden />
              Unlink
            </Button>
          </div>
        </div>
      ) : (
        <AccountForm label="Last.fm username" placeholder="Last.fm username" disabled={pending} pending={pending} action="Link" onSubmit={connect} />
      )}
    </section>
  );
}

// ── AniList ────────────────────────────────────────────────────────────────

function AniListSection({ username: initialName, link: initial, pushConfigured, redirectUri }: AccountsProps['anilist']) {
  const [name, setName] = useState(initialName);
  const [link, setLink] = useState(initial);
  const [pending, start] = useTransition();

  const save = (value: string) =>
    start(async () => {
      const res = await settle(setAniListUser(value));
      if (res.ok) {
        setName(value);
        setLink(res.account ?? null);
        toast.success('AniList username saved. Your lists are pulled every night.');
        if (res.notice) toast.warning(res.notice);
      } else toast.error(res.error ?? 'Could not save that.');
    });
  const sync = () =>
    start(async () => {
      const res = await settle(syncAniListNow());
      if (res.ok) {
        const skipped = res.skipped ? `, ${res.skipped} skipped (no sure match; use Import → AniList to review them)` : '';
        toast.success(`AniList synced: ${res.added ?? 0} added, ${res.updated ?? 0} updated${skipped}.`);
      }
      else toast.error(res.error ?? 'AniList sync failed.');
    });
  const connect = () =>
    start(async () => {
      const res = await settle(startAniListConnect());
      if (res.ok && res.url) window.location.assign(res.url);
      else toast.error(res.error ?? 'Could not start connecting AniList.');
    });
  const disconnect = () =>
    start(async () => {
      const res = await settle(disconnectAniList());
      if (res.ok) {
        setName(null);
        setLink(null);
        toast.success('AniList disconnected.');
      } else toast.error(res.error ?? 'Could not disconnect AniList.');
    });

  return (
    <section className="space-y-2" aria-labelledby="acc-anilist">
      <h3 id="acc-anilist" className="text-sm font-semibold">AniList</h3>
      <p className="text-sm text-muted-foreground">
        Every night your public AniList lists are pulled in: new titles are added, and status, score and progress are
        brought up to date (whichever side changed last wins; nothing is ever removed or moved back).
      </p>
      {name ? (
        <div className="space-y-2">
          <p className="text-sm">
            Pulling from <span className="font-medium">{name}</span>
            {link?.hasToken && <span className="text-muted-foreground"> · changes are pushed back</span>}
          </p>
          {link && <SyncState link={link} />}
          {/* Phones: full-width buttons, one per line; one row from sm, with
              Disconnect in a menu so the row fits beside the sidebar. */}
          <div data-actions="" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button size="sm" variant="outline" onClick={sync} disabled={pending} className="w-full sm:w-auto">
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden />}
              Sync now
            </Button>
            {pushConfigured && !link?.hasToken && (
              <Button size="sm" variant="outline" onClick={connect} disabled={pending} className="w-full sm:w-auto">
                <Link2 className="mr-2 h-4 w-4" aria-hidden />
                Connect to push changes
              </Button>
            )}
            <FoldedAction fold="sm" menuLabel="More AniList actions" label="Disconnect" onSelect={disconnect} disabled={pending} />
          </div>
        </div>
      ) : (
        <AccountForm label="AniList username" placeholder="AniList username" disabled={pending} pending={pending} action="Save" onSubmit={save} />
      )}
      {!pushConfigured && (
        <div className="space-y-1 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Sending your changes to AniList isn&apos;t set up on this server.</p>
          <p>
            The owner can turn it on: at anilist.co → Settings → Developer, create an API client with the redirect URL{' '}
            <code className="break-all rounded bg-muted px-1 py-0.5">{redirectUri}</code>, then add its id and secret as
            ANILIST_CLIENT_ID and ANILIST_CLIENT_SECRET, plus a random HOARD_SECRET of at least 32 characters (it
            encrypts the saved connection).
          </p>
        </div>
      )}
    </section>
  );
}
