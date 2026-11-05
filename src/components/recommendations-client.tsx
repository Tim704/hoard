'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { AddResultRow, useAddRows } from '@/components/add-row';
import { Cover } from '@/components/compare-parts';
import { Score } from '@/components/prefs-provider';
import { useTitleHref } from '@/components/title/title-link';
import { Button } from '@/components/ui/button';
import { passRecommendation, withdrawRecommendation } from '@/lib/actions/recommendations';
import { settle } from '@/lib/action-result';
import { CATEGORIES } from '@/lib/categories';
import type { RecommendationsPage, RecView } from '@/lib/data-recommendations';
import type { RecommendationRecord } from '@/lib/recommendations';
import type { NormalizedResult } from '@/lib/types';

type Page = Extract<RecommendationsPage, { ok: true }>;

/** The catalogue row an add button sends (the add path enriches it server-side). */
const resultOf = (it: RecView): NormalizedResult => ({
  externalId: it.externalId,
  title: typeof it.fields.title === 'string' && it.fields.title ? it.fields.title : it.title,
  imageUrl: it.imageUrl,
  subtitle: null,
  year: it.year,
  description: null,
  fields: it.fields,
});

export function RecommendationsClient({ page }: { page: Page }) {
  const empty = page.inbox.length + page.received.length + page.sent.length === 0;
  if (empty) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Nothing yet. Open any title and choose Send to a friend.
      </p>
    );
  }
  return (
    <div className="space-y-8">
      {page.inbox.length > 0 && <Inbox items={page.inbox} />}
      {(page.mine.sent > 0 || page.theirs.sent > 0) && (
        <section className="space-y-3" aria-labelledby="rec-record">
          <h2 id="rec-record" className="text-lg font-semibold">
            Your record
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {page.mine.sent > 0 && <RecordBlock heading="Your picks" record={page.mine} titles={page.bestWorst} />}
            {page.theirs.sent > 0 && <RecordBlock heading="Their picks" record={page.theirs} titles={page.bestWorst} />}
          </div>
        </section>
      )}
      {page.received.length > 0 && <RowList heading="Received" items={page.received} direction="received" />}
      {page.sent.length > 0 && <RowList heading="Sent" items={page.sent} direction="sent" />}
    </div>
  );
}

function Inbox({ items }: { items: RecView[] }) {
  const router = useRouter();
  const titleHrefOf = useTitleHref();
  const { rows, add, saveRating, setRow } = useAddRows();
  const [busy, setBusy] = useState<string | null>(null);
  // Rows this person has started adding. Adding settles the pick, so the server
  // drops it from `items` at once; the snapshot keeps it mounted (with its score
  // step) until the add finishes or the person moves on.
  const [started, setStarted] = useState<Record<string, RecView>>({});

  const keyOf = (it: RecView) => `${it.slug}:${it.externalId}`;
  const live = new Set(items.map((it) => it.id));
  const shown = [
    ...items,
    ...Object.values(started).filter((it) => {
      const phase = rows[keyOf(it)]?.phase;
      return !live.has(it.id) && (phase === 'saving' || phase === 'rating');
    }),
  ].sort((x, y) => y.createdAt.localeCompare(x.createdAt));

  async function pass(id: string) {
    setBusy(id);
    const res = await settle(passRecommendation(id));
    setBusy(null);
    if (!res.ok) toast.error(res.error ?? 'Could not pass on it.');
    router.refresh();
  }

  if (shown.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="rec-inbox">
      <h2 id="rec-inbox" className="text-lg font-semibold">
        Recommended to you
      </h2>
      <ul className="space-y-3">
        {shown.map((it) => {
          const key = keyOf(it);
          const note = it.note && <p className="whitespace-pre-line break-words text-sm">“{it.note}”</p>;
          return (
            <li key={it.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
              {it.myActivityId ? (
                <div className="flex items-start gap-3">
                  <Cover src={it.imageUrl} alt="" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">from {it.other}</p>
                    <p className="break-words font-medium">{it.title}</p>
                    {note}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">from {it.other}</p>
                  {note}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  {it.myActivityId ? (
                    <p className="text-sm text-muted-foreground">
                      Already on your list ·{' '}
                      <Link href={titleHrefOf(it.slug, it.myActivityId)} className="underline underline-offset-2">
                        Open it
                      </Link>
                    </p>
                  ) : (
                    <AddResultRow
                      slug={it.slug}
                      result={resultOf(it)}
                      row={rows[key]}
                      note={CATEGORIES[it.slug].singular}
                      onAdd={(status) => {
                        setStarted((prev) => ({ ...prev, [it.id]: it }));
                        void add(key, it.slug, resultOf(it), status);
                      }}
                      onRate={(rating) => {
                        const r = rows[key];
                        if (r?.phase === 'rating') void saveRating(key, r.activityId, rating);
                      }}
                      onSkipRate={() => setRow(key, { phase: 'done', rating: null })}
                    />
                  )}
                </div>
                <Button variant="outline" size="sm" disabled={busy === it.id || rows[key]?.phase === 'saving' || rows[key]?.phase === 'rating'} onClick={() => void pass(it.id)}>
                  Pass
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RecordBlock({
  heading,
  record,
  titles,
}: {
  heading: string;
  record: RecommendationRecord;
  titles: Record<string, string>;
}) {
  const stats: [string, number][] = [
    ['Sent', record.sent],
    ['Added', record.added],
    ['Finished', record.finished],
    ['Passed', record.passed],
  ];
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
      <h3 className="font-semibold">{heading}</h3>
      <dl className="grid grid-cols-4 gap-2 text-center">
        {stats.map(([label, n]) => (
          <div key={label} className="flex flex-col-reverse">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      <ul className="space-y-1 text-muted-foreground">
        <li>
          Average score: {record.averageScore != null ? <Score value={record.averageScore} /> : '–'}
        </li>
        <li>
          Average guess miss: {record.averageGuessMiss != null ? <Score value={record.averageGuessMiss} star={false} /> : '–'}
        </li>
        {record.bestId && titles[record.bestId] && <li className="break-words">Best: {titles[record.bestId]}</li>}
        {record.worstId && titles[record.worstId] && <li className="break-words">Worst: {titles[record.worstId]}</li>}
      </ul>
    </div>
  );
}

function RowList({ heading, items, direction }: { heading: string; items: RecView[]; direction: 'sent' | 'received' }) {
  return (
    <section className="space-y-3" aria-labelledby={`rec-${direction}`}>
      <h2 id={`rec-${direction}`} className="text-lg font-semibold">
        {heading}
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {items.map((it) => (
          <RecRow key={it.id} it={it} direction={direction} />
        ))}
      </ul>
    </section>
  );
}

function RecRow({ it, direction }: { it: RecView; direction: 'sent' | 'received' }) {
  const router = useRouter();
  const titleHrefOf = useTitleHref();
  const [busy, setBusy] = useState(false);
  const sent = direction === 'sent';

  async function withdraw() {
    setBusy(true);
    const res = await settle(withdrawRecommendation(it.id));
    setBusy(false);
    if (!res.ok) toast.error(res.error ?? 'Could not take it back.');
    router.refresh();
  }

  return (
    <li className="flex items-start gap-3 p-3">
      <Cover src={it.imageUrl} alt="" />
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <p className="text-xs text-muted-foreground">{sent ? `to ${it.other}` : `from ${it.other}`}</p>
        <p className="break-words font-medium">{it.title}</p>
        {it.note && <p className="whitespace-pre-line break-words">“{it.note}”</p>}
        <Outcome it={it} sent={sent} />
        {it.myActivityId && (
          <p>
            <Link href={titleHrefOf(it.slug, it.myActivityId)} className="text-muted-foreground underline underline-offset-2">
              Open it
            </Link>
          </p>
        )}
      </div>
      {it.withdrawable && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void withdraw()}>
          Withdraw
        </Button>
      )}
    </li>
  );
}

/** Waiting, or the verdict read from the viewer's side: who scored, who guessed. */
function Outcome({ it, sent }: { it: RecView; sent: boolean }) {
  const v = it.verdict;
  if (!v) {
    const line = sent ? it.waiting : it.response === 'PASSED' ? 'You passed' : it.response === 'ADDED' ? 'Not scored yet' : null;
    if (!line && !(sent && it.myGuess != null)) return null;
    return (
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
        {line && <span>{line}</span>}
        {sent && it.myGuess != null && (
          <span>
            Your guess: <Score value={it.myGuess} star={false} />
          </span>
        )}
      </p>
    );
  }
  // The recipient is you in Received and them in Sent; the sender is the other way round.
  const recipientName = sent ? it.other : 'You';
  const recipientPoss = sent ? `${it.other}’s` : 'Your';
  const senderPoss = sent ? 'Your' : `${it.other}’s`;
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
      {v.kind === 'dropped' ? (
        <span>
          {recipientName} dropped it
          {v.recipientScore != null && (
            <>
              {' '}at <Score value={v.recipientScore} />
            </>
          )}
        </span>
      ) : (
        v.recipientScore != null && (
          <span>
            {recipientPoss} score: <Score value={v.recipientScore} />
          </span>
        )
      )}
      {v.guess != null && (
        <span>
          {senderPoss} guess: <Score value={v.guess} />
        </span>
      )}
      {v.senderScore != null && (
        <span>
          {senderPoss} score: <Score value={v.senderScore} />
        </span>
      )}
    </p>
  );
}
