'use client';

// ───────────────────────────────────────────────────────────────────────────
//  Settings → API tokens (spec 8.7): name a token, see it once, copy it;
//  the list shows name, created and last used, with Revoke. The API is
//  read-only and documented in docs/API.md.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createApiToken, revokeApiToken } from '@/lib/actions/api-tokens';
import { MAX_TOKEN_NAME, MAX_TOKENS } from '@/lib/api-token-limits';
import type { ApiTokenRow } from '@/lib/data-api';

const DOCS_URL = 'https://github.com/Tim704/hoard/blob/main/docs/API.md';

export function SettingsApiTokens({ tokens }: { tokens: ApiTokenRow[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const full = tokens.length >= MAX_TOKENS;

  function create() {
    startTransition(async () => {
      const res = await createApiToken(name);
      if (res.ok && res.token) {
        setFresh({ name: name.trim(), token: res.token });
        setName('');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not create the token.');
      }
    });
  }

  function revoke(t: ApiTokenRow) {
    startTransition(async () => {
      const res = await revokeApiToken(t.id);
      setConfirming(null);
      if (res.ok) {
        toast.success(`Revoked “${t.name}”.`);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not revoke the token.');
      }
    });
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      toast.success('Token copied.');
    } catch {
      toast.error('Could not copy. Select the token and copy it by hand.');
    }
  }

  return (
    <Card id="api-tokens" className="scroll-mt-bar">
      <CardHeader>
        <CardTitle className="text-base">API tokens</CardTitle>
        <CardDescription>
          Read your library from scripts and other apps with a token: library, tiers, Up next and stats, read-only.{' '}
          <a href={DOCS_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
            How to use the API
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {fresh && (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3" role="status">
            <p className="text-sm font-medium">Your new token “{fresh.name}”</p>
            <p className="text-xs text-muted-foreground">Copy it now: it is shown only once. Anyone with it can read your library.</p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={fresh.token}
                aria-label="New API token"
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 font-mono text-xs"
              />
              <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" onClick={() => void copy(fresh.token)}>
                <Copy className="mr-2 h-4 w-4" aria-hidden />
                Copy
              </Button>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setFresh(null)}>
              Done
            </Button>
          </div>
        )}

        {tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tokens yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {tokens.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {t.created} · {t.lastUsed ? `last used ${t.lastUsed}` : 'never used'}
                    </p>
                  </div>
                </div>
                {confirming === t.id ? (
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={() => revoke(t)}>
                      Revoke “{t.name}”
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="shrink-0 self-start sm:self-auto" onClick={() => setConfirming(t.id)}>
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <Input
            aria-label="Token name"
            placeholder={full ? `You have ${MAX_TOKENS} tokens (the most)` : 'Name, e.g. “Home dashboard”'}
            value={name}
            maxLength={MAX_TOKEN_NAME}
            disabled={full}
            onChange={(e) => setName(e.target.value)}
            className="min-w-0 flex-1 text-base sm:text-sm"
          />
          <Button type="submit" size="sm" className="h-10 shrink-0 sm:h-9" disabled={isPending || full || !name.trim()}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" aria-hidden />}
            Create token
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
