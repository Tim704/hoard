'use client';

// ───────────────────────────────────────────────────────────────────────────
//  "Send to a friend" on a title's view (popup and full page): who recommended
//  it to you, and a small form to recommend it to a friend (friend, note,
//  optional hidden guess). Renders nothing until its context loads, when the
//  load fails, or when there is no friend and no recommender, so a person with
//  the switch off sees no change.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

import { LabelHeading, type HeadingLevel } from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { settle } from '@/lib/action-result';
import { loadRecommendContext, sendRecommendation } from '@/lib/actions/recommendations';
import { parseRatingInput } from '@/lib/rating';
import type { CategorySlug } from '@/lib/categories';
import type { RecommendContext } from '@/lib/data-recommendations';

export function RecommendPanel({
  activityId,
  headingLevel,
}: {
  activityId: string;
  slug: CategorySlug;
  headingLevel?: HeadingLevel;
}) {
  const [loaded, setLoaded] = useState<{ id: string; context: RecommendContext } | null>(null);
  useEffect(() => {
    let live = true;
    void settle(loadRecommendContext(activityId)).then((res) => {
      if (live && res.ok && res.context) setLoaded({ id: activityId, context: res.context });
    });
    return () => {
      live = false;
    };
  }, [activityId]);

  const context = loaded && loaded.id === activityId ? loaded.context : null;
  if (!context || (context.friends.length === 0 && context.recommendedBy.length === 0)) return null;

  return (
    <div className="space-y-3">
      <LabelHeading level={headingLevel}>
        <span className="text-sm font-medium">Friends</span>
      </LabelHeading>
      {context.recommendedBy.map((r, i) => (
        <div key={i} className="text-sm">
          <p className="text-muted-foreground">Recommended by {r.from}</p>
          {r.note && <p className="whitespace-pre-line break-words">“{r.note}”</p>}
        </div>
      ))}
      {context.friends.length > 0 && (
        <SendForm
          key={activityId}
          activityId={activityId}
          friends={context.friends}
          onSent={(username) =>
            setLoaded({
              id: activityId,
              context: {
                ...context,
                friends: context.friends.map((f) => (f.username === username ? { ...f, alreadySent: true } : f)),
              },
            })
          }
        />
      )}
    </div>
  );
}

function SendForm({
  activityId,
  friends,
  onSent,
}: {
  activityId: string;
  friends: RecommendContext['friends'];
  onSent: (username: string) => void;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [note, setNote] = useState('');
  const [guess, setGuess] = useState('');
  const [pending, setPending] = useState(false);

  const available = friends.filter((f) => !f.alreadySent);
  const chosen = available.some((f) => f.username === username) ? username : (available[0]?.username ?? '');
  const single = friends.length === 1;

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

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send className="mr-2 h-4 w-4" aria-hidden />
        Send to a friend
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {single ? (
          <>
            <p className="text-sm font-medium">Friend</p>
            <p className="text-sm">
              {friends[0].username}
              {friends[0].alreadySent && <span className="ml-2 text-muted-foreground">Sent</span>}
            </p>
          </>
        ) : (
          <>
          <label htmlFor={`${uid}-friend`} className="text-sm font-medium">
            Friend
          </label>
          <select
            id={`${uid}-friend`}
            value={chosen}
            onChange={(e) => setUsername(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {friends.map((f) => (
              <option key={f.username} value={f.username} disabled={f.alreadySent}>
                {f.username}
                {f.alreadySent ? ' · Sent' : ''}
              </option>
            ))}
          </select>
          </>
        )}
      </div>
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
          Your guess at their score, hidden until they’ve scored it
        </label>
        <Input
          id={`${uid}-guess`}
          type="text"
          inputMode="decimal"
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          placeholder="0–10 (optional)"
          className="w-28"
        />
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
      {available.length === 0 && <p className="text-sm text-muted-foreground">You’ve sent this to everyone.</p>}
    </div>
  );
}
