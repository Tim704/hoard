'use client';

// ───────────────────────────────────────────────────────────────────────────
//  Settings → Notifications: the user's own ntfy topic URL and Discord webhook
//  (both optional, https only), which kinds get pushed, and "Send test". The
//  bell in the header always shows every notification.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { sendTestNotification } from '@/lib/actions/notifications';
import { updatePrefs } from '@/lib/actions/prefs';
import { NOTIFY_KINDS, type NotifyKind } from '@/lib/prefs';
import { cn } from '@/lib/utils';

type PushKind = Exclude<NotifyKind, 'test'>;

const KIND_LABEL: Record<PushKind, string> = {
  releases: 'Releases today',
  'new-seasons': 'New seasons',
  backup: 'Backup problems',
  sync: 'Sync errors',
  'list-shared': 'Lists shared with you',
  lastfm: 'Albums Last.fm says you played',
};

export interface NotifySettings {
  ntfyUrl: string | null;
  discordWebhook: string | null;
  kinds: string[];
}

export function SettingsNotifications({ initial }: { initial: NotifySettings }) {
  const [saved, setSaved] = useState(initial);
  const [ntfyUrl, setNtfyUrl] = useState(initial.ntfyUrl ?? '');
  const [discordWebhook, setDiscordWebhook] = useState(initial.discordWebhook ?? '');
  // An empty stored list means "every kind".
  const [kinds, setKinds] = useState<PushKind[]>(() => {
    const stored = initial.kinds.filter((k): k is PushKind => (NOTIFY_KINDS as readonly string[]).includes(k));
    return stored.length ? stored : [...NOTIFY_KINDS];
  });
  const [isPending, startTransition] = useTransition();

  const dirty =
    (ntfyUrl.trim() || null) !== saved.ntfyUrl || (discordWebhook.trim() || null) !== saved.discordWebhook;

  /** Save URLs + kinds. `onFail` rolls back optimistic local state. */
  function persist(
    urls: Pick<NotifySettings, 'ntfyUrl' | 'discordWebhook'>,
    nextKinds: PushKind[],
    onFail?: () => void,
  ) {
    const notify = { ...urls, kinds: nextKinds.length === NOTIFY_KINDS.length ? [] : nextKinds };
    startTransition(async () => {
      const res = await updatePrefs({ notify });
      if (res.ok) {
        setSaved(notify);
        toast.success('Notification settings saved.');
      } else {
        onFail?.();
        toast.error(res.error ?? 'Could not save notification settings.');
      }
    });
  }

  function toggleKind(k: PushKind) {
    const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
    if (next.length === 0) {
      toast.error('Keep at least one kind, or clear the URLs to stop pushing.');
      return;
    }
    const before = kinds;
    setKinds(next);
    // Kind toggles save on their own, with the already-saved URLs.
    persist(saved, next, () => setKinds(before));
  }

  function sendTest() {
    startTransition(async () => {
      const res = await sendTestNotification();
      const where = res.pushed?.length ? ` and sent to ${res.pushed.join(' and ')}` : '';
      if (res.ok) toast.success(`Test notification added to the bell${where}.`);
      else toast.error(`Test failed: ${res.error ?? 'unknown error'}`);
    });
  }

  return (
    <Card id="notifications" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-base">Notifications</CardTitle>
        <CardDescription>
          Notifications always appear under the bell. You can also push them to your own ntfy topic
          or a Discord channel webhook (public https URLs only).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            persist(
              { ntfyUrl: ntfyUrl.trim() || null, discordWebhook: discordWebhook.trim() || null },
              kinds,
            );
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="ntfyUrl" className="text-sm font-medium">
              ntfy topic URL
            </label>
            <Input
              id="ntfyUrl"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://ntfy.sh/your-secret-topic"
              value={ntfyUrl}
              onChange={(e) => setNtfyUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="discordWebhook" className="text-sm font-medium">
              Discord webhook URL
            </label>
            <Input
              id="discordWebhook"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://discord.com/api/webhooks/…"
              value={discordWebhook}
              onChange={(e) => setDiscordWebhook(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={isPending || !dirty}>
              Save
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={sendTest} disabled={isPending || dirty}>
              <Send className="mr-2 h-4 w-4" aria-hidden />
              Send test
            </Button>
          </div>
        </form>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Push these</p>
          <div className="flex flex-wrap gap-2">
            {NOTIFY_KINDS.map((k) => {
              const on = kinds.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  disabled={isPending}
                  onClick={() => toggleKind(k)}
                  className={cn(
                    'inline-flex items-center rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                    on
                      ? 'border-primary/40 bg-accent text-accent-foreground'
                      : 'border-dashed border-border text-muted-foreground',
                  )}
                >
                  {KIND_LABEL[k]}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Backup problems only go to the owner (the first account).</p>
        </div>
      </CardContent>
    </Card>
  );
}
