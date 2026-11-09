'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import { AddResultRow, useAddRows, type RowState } from '@/components/add-row';
import { Cover } from '@/components/compare-parts';
import { Score } from '@/components/prefs-provider';
import { useTitleHref } from '@/components/title/title-link';
import { Button } from '@/components/ui/button';
import { toastUndoable } from '@/components/undo-toast';
import { passRecommendation, unpassRecommendation, withdrawRecommendation } from '@/lib/actions/recommendations';
import { settle } from '@/lib/action-result';
import { CATEGORIES } from '@/lib/categories';
import type { RecommendationsPage, RecView } from '@/lib/data-recommendations';
import type { RecommendationRecord } from '@/lib/recommendations';
import { settingsHref } from '@/lib/settings-nav';
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

/** An add that is still being saved or scored keeps its inbox row on screen. */
const inProgress = (row: RowState | undefined) => row?.phase === 'saving' || row?.phase === 'rating';

export function RecommendationsClient({ page }: { page: Page }) {
  // The inbox's add rows live here, so a pick being scored in the inbox isn't
  // also listed under Received (adding it settles it there at once).
  const adds = useAddRows();
  const [started, setStarted] = useState<Record<string, RecView>>({});
  const scoring = new Set(Object.keys(started).filter((id) => inProgress(adds.rows[id])));

  const empty = page.inbox.length + page.received.length + page.sent.length === 0;
  if (empty) return <EmptyState friends={page.friends} />;

  const received = page.received.filter((it) => !scoring.has(it.id));
  return (
    <div className="space-y-8">
      {/* Always mounted: it keeps a row on screen while its score step is open. */}
      <Inbox items={page.inbox} adds={adds} started={started} onStart={(it) => setStarted((s) => ({ ...s, [it.id]: it }))} />
      {page.sent.length > 0 && <RowList heading="Sent" items={page.sent} direction="sent" />}
      {received.length > 0 && <RowList heading="Received" items={received} direction="received" />}
      {(page.mine.sent > 0 || page.theirs.sent > 0) && (
        <section className="space-y-3" aria-labelledby="rec-record">
          <h2 id="rec-record" className="text-lg font-semibold">
            Your record
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {page.mine.sent > 0 && <RecordBlock side="mine" record={page.mine} picks={page.bestWorst} />}
            {page.theirs.sent > 0 && <RecordBlock side="theirs" record={page.theirs} picks={page.bestWorst} />}
          </div>
        </section>
      )}
    </div>
  );
}

function EmptyState({ friends }: { friends: number }) {
  if (friends > 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Nothing yet. Open any title in your library and choose <strong className="text-foreground">Send to a friend</strong>.
      </p>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border p-6 text-sm">
      <p>
        Nobody else here has sharing turned on yet. Recommendations work between people who both turned on{' '}
        <strong>Let other users of this Hoard compare with me</strong> in Settings. Once your friend does, you can send
        each other titles.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href={settingsHref('sharing', 'compare')}>Open Settings</Link>
      </Button>
    </div>
  );
}

function Inbox({
  items,
  adds,
  started,
  onStart,
}: {
  items: RecView[];
  adds: ReturnType<typeof useAddRows>;
  started: Record<string, RecView>;
  onStart: (it: RecView) => void;
}) {
  const router = useRouter();
  const titleHrefOf = useTitleHref();
  const { rows, add, saveRating, setRow } = adds;
  const [busy, setBusy] = useState<string | null>(null);

  // Rows being added: adding settles the pick, so the server drops it from
  // `items` at once; the snapshot keeps it mounted (with its score step) until
  // the add finishes or the person moves on.
  const live = new Set(items.map((it) => it.id));
  const shown = [
    ...items,
    ...Object.values(started).filter((it) => !live.has(it.id) && inProgress(rows[it.id])),
  ].sort((x, y) => y.createdAt.localeCompare(x.createdAt));

  async function undoPass(it: RecView) {
    const res = await settle(unpassRecommendation(it.id));
    if (res.ok) toast.success(`“${it.title}” is back in your inbox.`);
    else toast.error(res.error ?? 'Could not undo that.');
    router.refresh();
  }

  async function pass(it: RecView) {
    setBusy(it.id);
    const res = await settle(passRecommendation(it.id));
    setBusy(null);
    if (res.ok) toastUndoable(`Passed on “${it.title}”.`, () => void undoPass(it), `rec-pass:${it.id}`);
    else toast.error(res.error ?? 'Could not pass on it.');
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
          const row = rows[it.id];
          const owned = it.myActivityId;
          return (
            <li key={it.id} className="relative space-y-2 rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    From {it.other} · {it.when}
                  </p>
                  {it.note && <p className="whitespace-pre-line break-words text-sm">“{it.note}”</p>}
                </div>
                {/* Once an add has started, the pick is answered: no Pass. */}
                {!row && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="relative z-10 shrink-0"
                    disabled={busy === it.id}
                    onClick={() => void pass(it)}
                  >
                    Pass
                  </Button>
                )}
              </div>
              {owned ? (
                <div className="flex items-center gap-3">
                  <Cover src={it.imageUrl} alt="" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    {/* The whole card opens the title; buttons sit above the link. */}
                    <Link
                      href={titleHrefOf(it.slug, owned)}
                      className="break-words font-medium after:absolute after:inset-0 after:rounded-xl after:content-['']"
                    >
                      {it.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">Already on your list. Score it to give your verdict.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
              ) : (
                <AddResultRow
                  slug={it.slug}
                  result={resultOf(it)}
                  row={row}
                  note={CATEGORIES[it.slug].singular}
                  fullTitle
                  onAdd={(status) => {
                    onStart(it);
                    void add(it.id, it.slug, resultOf(it), status);
                  }}
                  onRate={(rating) => {
                    if (row?.phase === 'rating') void saveRating(it.id, row.activityId, rating);
                  }}
                  onSkipRate={() => setRow(it.id, { phase: 'done', rating: null })}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Best and worst picks, with the score each got. */
type Picks = Page['bestWorst'];

function RecordBlock({ side, record, picks }: { side: 'mine' | 'theirs'; record: RecommendationRecord; picks: Picks }) {
  const mine = side === 'mine';
  const stats: [string, number][] = [
    ['Sent', record.sent],
    ['Added', record.added],
    ['Finished', record.finished],
    ['Passed', record.passed],
  ];
  const best = record.bestId ? picks[record.bestId] : undefined;
  const worst = record.worstId && record.worstId !== record.bestId ? picks[record.worstId] : undefined;
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3 text-sm">
      <h3 className="font-semibold">{mine ? 'Your picks' : 'Their picks'}</h3>
      <dl className="grid grid-cols-4 gap-2 text-center">
        {stats.map(([label, n]) => (
          <div key={label} className="flex flex-col-reverse">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      {(record.averageScore != null || record.averageGuessMiss != null || best || worst) && (
        <ul className="space-y-1 text-muted-foreground">
          {record.averageScore != null && (
            <li>
              {mine ? 'They scored them' : 'You scored them'}{' '}
              <span className="font-medium text-foreground">
                <Score value={record.averageScore} />
              </span>{' '}
              on average
            </li>
          )}
          {record.averageGuessMiss != null && (
            <li>
              {mine ? 'Your' : 'Their'} guesses were off by{' '}
              <span className="font-medium text-foreground">
                <Score value={record.averageGuessMiss} star={false} />
              </span>{' '}
              on average
            </li>
          )}
          {best && <PickLine label="Best" pick={best} />}
          {worst && <PickLine label="Worst" pick={worst} />}
        </ul>
      )}
    </div>
  );
}

function PickLine({ label, pick }: { label: string; pick: { title: string; score: number } }) {
  return (
    <li className="break-words">
      {label}: <span className="text-foreground">{pick.title}</span> ·{' '}
      <span className="font-medium text-foreground">
        <Score value={pick.score} />
      </span>
    </li>
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
  const [confirming, setConfirming] = useState(false);
  const sent = direction === 'sent';
  const href = it.myActivityId ? titleHrefOf(it.slug, it.myActivityId) : null;
  const canUnpass = !sent && it.response === 'PASSED' && !it.verdict;

  async function run(action: Promise<{ ok: boolean; error?: string }>, fallback: string) {
    setBusy(true);
    const res = await settle(action);
    setBusy(false);
    setConfirming(false);
    if (!res.ok) toast.error(res.error ?? fallback);
    router.refresh();
  }

  return (
    <li className="relative space-y-2 p-3">
      <div className="flex items-start gap-3">
        <Cover src={it.imageUrl} alt="" />
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p className="text-xs text-muted-foreground">
            {sent ? `To ${it.other}` : `From ${it.other}`} · {it.when}
          </p>
          {href ? (
            // The whole row opens the title; buttons sit above the link.
            <Link href={href} className="block break-words font-medium after:absolute after:inset-0 after:content-['']">
              {it.title}
            </Link>
          ) : (
            <p className="break-words font-medium">{it.title}</p>
          )}
          {it.note && <p className="whitespace-pre-line break-words">“{it.note}”</p>}
          {it.verdict ? <VerdictStrip it={it} sent={sent} /> : <Waiting it={it} sent={sent} />}
        </div>
        {href && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
      </div>
      {(it.withdrawable || canUnpass) && (
        <div className="relative z-10 flex flex-wrap items-center gap-2 pl-14">
          {canUnpass && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(unpassRecommendation(it.id), 'Could not undo that.')}>
              Undo pass
            </Button>
          )}
          {it.withdrawable &&
            (confirming ? (
              <>
                <span className="text-sm">Take it back?</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void run(withdrawRecommendation(it.id), 'Could not take it back.')}
                >
                  Yes, take it back
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
                Take back
              </Button>
            ))}
        </div>
      )}
    </li>
  );
}

/** Where a pick stands while there's no verdict, plus the sender's own guess. */
function Waiting({ it, sent }: { it: RecView; sent: boolean }) {
  const guess = sent ? it.myGuess : null;
  if (!it.waiting && guess == null) return null;
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
      {it.waiting && <span>{it.waiting}</span>}
      {guess != null && (
        <span>
          Your guess: <Score value={guess} />
        </span>
      )}
    </p>
  );
}

/** The payoff: the recipient's score next to the guess and the sender's own score. */
function VerdictStrip({ it, sent }: { it: RecView; sent: boolean }) {
  const v = it.verdict;
  if (!v) return null;
  // The recipient is them in Sent and you in Received; the sender the other way round.
  const recipient = sent ? 'Their' : 'Your';
  const sender = sent ? 'Your' : 'Their';
  const cells: { label: string; value: number | null }[] = [
    {
      label: v.kind === 'dropped' ? (sent ? 'They dropped it' : 'You dropped it') : `${recipient} score`,
      value: v.recipientScore,
    },
  ];
  if (v.guess != null) cells.push({ label: `${sender} guess`, value: v.guess });
  if (v.senderScore != null) cells.push({ label: `${sender} score`, value: v.senderScore });
  const miss = v.guess != null && v.recipientScore != null ? Math.round(Math.abs(v.guess - v.recipientScore) * 10) / 10 : null;

  return (
    <div className="space-y-1 pt-1">
      <dl className="grid auto-cols-fr grid-flow-col gap-1.5">
        {cells.map((c) => (
          <div key={c.label} className="rounded-md bg-muted/60 px-2 py-1.5 text-center">
            <dt className="text-xs text-muted-foreground">{c.label}</dt>
            <dd className="text-base font-semibold tabular-nums">{c.value != null ? <Score value={c.value} /> : '–'}</dd>
          </div>
        ))}
      </dl>
      {miss != null && (
        <p className="text-xs text-muted-foreground">
          {miss === 0 ? (
            'Spot on.'
          ) : (
            <>
              The guess was off by <Score value={miss} star={false} />.
            </>
          )}
        </p>
      )}
    </div>
  );
}
