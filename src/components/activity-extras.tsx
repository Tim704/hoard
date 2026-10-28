'use client';

// The lower half of the details dialog (spec 3.1–3.6): ownership / format,
// "Watched 3× · last …" with Watch again, the latest entry's review, a game's
// play sessions, and the History. Loads the activity's log on open.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, History, Loader2, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { useDisplayTitle, usePrefs, useScoreFormat } from '@/components/prefs-provider';
import { toastStatusChange } from '@/components/undo-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  deletePlaySession,
  getActivityLog,
  logPlaySession,
  setLatestReview,
  setOwnership,
  startRewatch,
  type ActivityLog,
} from '@/lib/actions/diary';
import { historyItems } from '@/lib/history';
import { cleanPlatforms, formatLabel, formatOptions } from '@/lib/ownership';
import { formatYmd } from '@/lib/release';
import { formatMinutes, groupRuns, monthGrid, monthLabel, shiftMonth, timesLine } from '@/lib/sessions';
import { againLabel, statusLabel } from '@/lib/status';
import type { ActivityWithMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ActivityExtrasProps {
  activity: ActivityWithMedia;
  disabled?: boolean;
  /** Close the details (after Watch again, which changes the status). */
  onClose: () => void;
}

/** Render with `key={activity.id}`. */
export function ActivityExtras({ activity, disabled, onClose }: ActivityExtrasProps) {
  const router = useRouter();
  const [log, setLog] = useState<ActivityLog | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const res = await getActivityLog(activity.id);
    if (res.ok && res.log) {
      setLog(res.log);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, [activity.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = () => {
    void load();
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <OwnershipField activity={activity} disabled={disabled} />
      {failed && <p className="text-xs text-muted-foreground">Could not load the history.</p>}
      {log && (
        <>
          <Runs activity={activity} log={log} disabled={disabled} onClose={onClose} />
          {log.diary.length > 0 && (
            <ReviewField key={log.diary[0].id} activityId={activity.id} initial={log.diary[0].review ?? ''} onSaved={changed} />
          )}
          {activity.category === 'games' && <Sessions activityId={activity.id} log={log} onChanged={changed} />}
          <HistoryList activity={activity} log={log} />
        </>
      )}
    </div>
  );
}

// ── Ownership / format (3.5) ─────────────────────────────────────────────────

function OwnershipField({ activity, disabled }: { activity: ActivityWithMedia; disabled?: boolean }) {
  const router = useRouter();
  const slug = activity.category;
  const [platforms, setPlatforms] = useState<string[]>(activity.ownedPlatforms);
  const [format, setFormat] = useState<string | null>(activity.format);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const formats = formatOptions(slug);

  async function save(input: { ownedPlatforms?: string[]; format?: string | null }, undo: () => void) {
    setSaving(true);
    try {
      const res = await setOwnership(activity.id, input);
      if (res.ok) router.refresh();
      else {
        undo();
        toast.error(res.error ?? 'Could not save that.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (slug === 'games') {
    const known = (Array.isArray(activity.media.platforms) ? activity.media.platforms : []).filter(
      (p): p is string => typeof p === 'string' && !platforms.some((x) => x.toLowerCase() === p.toLowerCase()),
    );
    const update = (next: string[]) => {
      const prev = platforms;
      const clean = cleanPlatforms(next);
      setPlatforms(clean);
      void save({ ownedPlatforms: clean }, () => setPlatforms(prev));
    };
    const addTyped = () => {
      if (!text.trim()) return;
      update([...platforms, text]);
      setText('');
    };
    const listId = `owned-${activity.id}`;
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor={listId + '-input'}>
          Owned on
        </label>
        {platforms.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {platforms.map((p) => (
              <span key={p} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs">
                {p}
                <button
                  type="button"
                  aria-label={`Remove ${p}`}
                  disabled={disabled || saving}
                  onClick={() => update(platforms.filter((x) => x !== p))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
        {known.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {known.slice(0, 12).map((p) => (
              <button
                key={p}
                type="button"
                disabled={disabled || saving}
                onClick={() => update([...platforms, p])}
                className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              >
                + {p}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            id={listId + '-input'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTyped();
              }
            }}
            placeholder="Another platform…"
            maxLength={60}
            className="h-9 text-base sm:text-sm"
          />
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={disabled || saving || !text.trim()} onClick={addTyped}>
            Add
          </Button>
        </div>
      </div>
    );
  }

  if (!formats.length) return null;
  const NONE = '__none';
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">Format</label>
      <Select
        value={format ?? NONE}
        disabled={disabled || saving}
        onValueChange={(v) => {
          const prev = format;
          const next = v === NONE ? null : v;
          setFormat(next);
          void save({ format: next }, () => setFormat(prev));
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not set</SelectItem>
          {formats.map((f) => (
            <SelectItem key={f} value={f}>
              {formatLabel(f)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Runs: "Watched 3× · last …" and Watch again (3.1) ───────────────────────

function Runs({
  activity,
  log,
  disabled,
  onClose,
}: {
  activity: ActivityWithMedia;
  log: ActivityLog;
  disabled?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleOf = useDisplayTitle();
  const [busy, setBusy] = useState(false);
  const line = timesLine(activity.category, log.diary.map((d) => d.date));
  const canRestart = activity.status === 'COMPLETED' || activity.status === 'RETIRED';
  if (!line && !canRestart && !activity.rewatching) return null;

  async function again() {
    setBusy(true);
    try {
      const res = await startRewatch(activity.id);
      if (res.ok) {
        const refresh = () => router.refresh();
        toastStatusChange(
          `Started “${titleOf(activity.media)}” again: ${statusLabel('CONSUMING', activity.category)}.`,
          activity.id,
          res.previous,
          refresh,
        );
        refresh();
        onClose();
      } else {
        toast.error(res.error ?? 'Could not start again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
      <p className="text-sm">
        {line ?? 'Not in the diary yet.'}
        {activity.rewatching && <span className="ml-1 text-muted-foreground">· repeat in progress</span>}
      </p>
      {canRestart && (
        <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => void again()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" aria-hidden />}
          {againLabel(activity.category)}
        </Button>
      )}
    </div>
  );
}

// ── Review (3.4) ─────────────────────────────────────────────────────────────

function ReviewField({ activityId, initial, onSaved }: { activityId: string; initial: string; onSaved: () => void }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = value.trim() !== initial.trim();

  async function save() {
    setSaving(true);
    try {
      const res = await setLatestReview(activityId, value);
      if (res.ok) {
        toast.success('Review saved.');
        onSaved();
      } else {
        toast.error(res.error ?? 'Could not save the review.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" htmlFor={`review-${activityId}`}>
        Review
      </label>
      <Textarea
        id={`review-${activityId}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="What did you think? (on your latest diary entry)"
        className="text-base sm:text-sm"
        rows={3}
        maxLength={20_000}
      />
      {dirty && (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save review
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Play sessions (3.6) ──────────────────────────────────────────────────────

function Sessions({ activityId, log, onChanged }: { activityId: string; log: ActivityLog; onChanged: () => void }) {
  const { weekStart } = usePrefs();
  const [date, setDate] = useState(log.today);
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(() => ({ year: Number(log.today.slice(0, 4)), month: Number(log.today.slice(5, 7)) }));

  const played = useMemo(() => new Set(log.sessions.map((s) => s.date)), [log.sessions]);
  const runs = useMemo(() => groupRuns(log.sessions).reverse(), [log.sessions]);
  const weeks = monthGrid(month.year, month.month, weekStart);
  const dayNames = Array.from({ length: 7 }, (_, i) =>
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][(i + weekStart) % 7],
  );

  async function add() {
    const m = minutes.trim() === '' ? null : Number(minutes);
    if (m !== null && (!Number.isInteger(m) || m < 1 || m > 1440)) {
      toast.error('Minutes must be a whole number from 1 to 1440.');
      return;
    }
    setSaving(true);
    try {
      const res = await logPlaySession(activityId, { date, minutes: m, note: note.trim() || null });
      if (res.ok) {
        toast.success('Session logged.');
        setMinutes('');
        setNote('');
        onChanged();
      } else {
        toast.error(res.error ?? 'Could not log that session.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await deletePlaySession(id);
    if (res.ok) onChanged();
    else toast.error(res.error ?? 'Could not delete that session.');
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Play sessions</p>
      <div className="grid grid-cols-[1fr_5.5rem] gap-2">
        <Input
          type="date"
          aria-label="Day played"
          value={date}
          max={log.today}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 text-base sm:text-sm"
        />
        <Input
          type="number"
          inputMode="numeric"
          aria-label="Minutes"
          placeholder="Min"
          min={1}
          max={1440}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="h-9 text-base sm:text-sm"
        />
        <Input
          aria-label="Note"
          placeholder="Note (optional)"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="col-span-2 h-9 text-base sm:text-sm"
        />
      </div>
      <Button type="button" size="sm" disabled={saving || !date} onClick={() => void add()}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" aria-hidden />}
        Log a session
      </Button>

      {/* A small month calendar of the days played. */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m.year, m.month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium">{monthLabel(`${month.year}-${String(month.month).padStart(2, '0')}`)}</span>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Next month" onClick={() => setMonth((m) => shiftMonth(m.year, m.month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
          {dayNames.map((d) => (
            <span key={d} className="text-muted-foreground">
              {d}
            </span>
          ))}
          {weeks.flat().map((day, i) =>
            day ? (
              <span
                key={day}
                title={played.has(day) ? `Played ${formatYmd(day)}` : undefined}
                className={cn(
                  'rounded py-0.5 tabular-nums',
                  played.has(day) ? 'bg-emerald-500/80 font-semibold text-white' : 'text-muted-foreground',
                  day === log.today && 'ring-1 ring-foreground/40',
                )}
              >
                {Number(day.slice(8))}
              </span>
            ) : (
              <span key={`pad-${i}`} />
            ),
          )}
        </div>
      </div>

      {runs.length > 0 && (
        <div className="space-y-2">
          {runs.map((run) => (
            <div key={run.start} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {run.start === run.end ? formatYmd(run.start) : `${formatYmd(run.start)} – ${formatYmd(run.end)}`} ·{' '}
                {run.sessions.length} {run.sessions.length === 1 ? 'session' : 'sessions'}
                {run.minutes > 0 && ` · ${formatMinutes(run.minutes)}`}
              </p>
              <ul className="space-y-0.5">
                {[...run.sessions].reverse().map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="tabular-nums">{formatYmd(s.date)}</span>
                    {s.minutes != null && <span className="text-muted-foreground">{formatMinutes(s.minutes)}</span>}
                    {s.note && <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.note}</span>}
                    <button
                      type="button"
                      aria-label={`Delete the session of ${formatYmd(s.date)}`}
                      className="ml-auto text-muted-foreground hover:text-rose-500"
                      onClick={() => void remove(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── History (3.2) ────────────────────────────────────────────────────────────

const HISTORY_PREVIEW = 8;

function HistoryList({ activity, log }: { activity: ActivityWithMedia; log: ActivityLog }) {
  const { score } = useScoreFormat();
  const [all, setAll] = useState(false);
  const items = useMemo(
    () => historyItems(log.events, log.diary, activity.category, log.timeZone, (v) => score(v)),
    [log, activity.category, score],
  );
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, HISTORY_PREVIEW);
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <History className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        History
      </p>
      <ol className="space-y-1 border-l border-border pl-3">
        {shown.map((item) => (
          <li key={`${item.kind}-${item.id}`} className="text-xs">
            <span className="tabular-nums text-muted-foreground">{formatYmd(item.day)}</span>{' '}
            <span className={cn(item.kind === 'diary' && 'font-medium')}>{item.text}</span>
          </li>
        ))}
      </ol>
      {items.length > HISTORY_PREVIEW && (
        <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setAll((v) => !v)}>
          {all ? 'Show less' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}
