'use client';

// ───────────────────────────────────────────────────────────────────────────
//  "Send to a friend" on a title's view (popup and full page): who recommended
//  it to you, and a small form to recommend it to a friend (friend, note,
//  optional hidden guess). Renders nothing until its context loads, when the
//  load fails, or when there is no friend and no recommender, so a person with
//  the switch off sees no change. The full page hands over the context it
//  loaded on the server, so the page doesn't jump when the panel appears.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

import { LabelHeading, type HeadingLevel } from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { settle } from '@/lib/action-result';
import { loadRecommendContext, sendRecommendation } from '@/lib/actions/recommendations';
import { parseRatingInput } from '@/lib/rating';
import type { RecommendContext } from '@/lib/data-recommendations';

type Friend = RecommendContext['friends'][number];

export function RecommendPanel({
  activityId,
  headingLevel,
  initial,
}: {
  activityId: string;
  headingLevel?: HeadingLevel;
  /** The context, already loaded on the server (the full page). */
  initial?: RecommendContext | null;
}) {
  const [loaded, setLoaded] = useState<{ id: string; context: RecommendContext } | null>(
    initial ? { id: activityId, context: initial } : null,
  );
  const preloaded = !!initial;
  useEffect(() => {
    if (preloaded) return;
    let live = true;
    void settle(loadRecommendContext(activityId)).then((res) => {
      if (live && res.ok && res.context) setLoaded({ id: activityId, context: res.context });
    });
    return () => {
      live = false;
    };
  }, [activityId, preloaded]);

  const context = loaded && loaded.id === activityId ? loaded.context : null;
  if (!context || (context.friends.length === 0 && context.recommendedBy.length === 0)) return null;

  // Only ever touch this title's state: a send can finish after the popup moved on.
  const markSent = (username: string) =>
    setLoaded((prev) =>
      prev && prev.id === activityId
        ? {
            id: prev.id,
            context: {
              ...prev.context,
              friends: prev.context.friends.map((f) => (f.username === username ? { ...f, alreadySent: true } : f)),
            },
          }
        : prev,
    );

  return (
    <div className="space-y-3">
      <LabelHeading level={headingLevel}>
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {headingLevel && <Send className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
          Friends
        </span>
      </LabelHeading>
      {context.recommendedBy.map((r, i) => (
        <div key={i} className="text-sm">
          <p className="text-muted-foreground">Recommended to you by {r.from}</p>
          {r.note && <p className="whitespace-pre-line break-words">“{r.note}”</p>}
        </div>
      ))}
      {context.friends.length > 0 && (
        <SendForm key={activityId} activityId={activityId} friends={context.friends} onSent={markSent} />
      )}
    </div>
  );
}

/** Why a friend can't get this pick, or null when they can. */
function unavailable(f: Friend): string | null {
  if (f.alreadySent) return 'sent';
  if (f.decided) return 'already scored';
  return null;
}

function SendForm({
  activityId,
  friends,
  onSent,
}: {
  activityId: string;
  friends: Friend[];
  onSent: (username: string) => void;
}) {
  const uid = useId();
  const formRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [note, setNote] = useState('');
  const [guess, setGuess] = useState('');
  const [pending, setPending] = useState(false);

  const available = friends.filter((f) => !unavailable(f));
  const chosen = available.some((f) => f.username === username) ? username : (available[0]?.username ?? '');
  const single = friends.length === 1 ? friends[0] : null;

  // On a phone the form opens below the fold of the bottom sheet: bring it up.
  useEffect(() => {
    if (open) formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open]);

  async function send() {
    if (pending || !chosen) return;
    const guessed = guess.trim() === '' ? undefined : parseRatingInput(guess);
    if (guessed === null) {
      toast.error('Guess must be a number from 0 to 10.');
      return;
    }
    setPending(true);
    const res = await settle(sendRecommendation(activityId, chosen, { note: note.trim() || undefined, guess: guessed }));
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? 'Could not send that.');
      return;
    }
    toast.success(`Sent to ${chosen}.`);
    onSent(chosen);
    setNote('');
    setGuess('');
    setOpen(false);
  }

  // Nobody left to send it to: say why instead of offering a Send that can't work.
  if (available.length === 0) {
    if (single) {
      return single.alreadySent ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-emerald-500" aria-hidden />
          You sent this to {single.username}.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{single.username} has already scored this.</p>
      );
    }
    return (
      <p className="text-sm text-muted-foreground">
        Every friend has this from you already, or has already scored it.
      </p>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send className="mr-2 h-4 w-4" aria-hidden />
        {single ? `Send to ${single.username}` : 'Send to a friend'}
      </Button>
    );
  }

  return (
    <div ref={formRef} className="space-y-3 rounded-lg border border-border p-3">
      {single ? (
        <p className="text-sm font-medium">To {single.username}</p>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-friend`} className="text-sm font-medium">
            Friend
          </label>
          <select
            id={`${uid}-friend`}
            value={chosen}
            onChange={(e) => setUsername(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {friends.map((f) => {
              const why = unavailable(f);
              return (
                <option key={f.username} value={f.username} disabled={!!why}>
                  {f.username}
                  {why ? ` · ${why}` : ''}
                </option>
              );
            })}
          </select>
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor={`${uid}-note`} className="text-sm font-medium">
          Note for your friend
        </label>
        <Textarea
          id={`${uid}-note`}
          value={note}
          maxLength={500}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why you think they’ll like it (optional)"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${uid}-guess`} className="text-sm font-medium">
          Your guess at their score
        </label>
        <div className="flex items-center gap-2">
          <Input
            id={`${uid}-guess`}
            type="text"
            inputMode="decimal"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="0–10"
            aria-describedby={`${uid}-guess-hint`}
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">/10</span>
        </div>
        <p id={`${uid}-guess-hint`} className="text-xs text-muted-foreground">
          Optional. They won’t see it until they’ve scored it.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={pending || !chosen} onClick={() => void send()}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
