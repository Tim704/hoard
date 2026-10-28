'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Tag, X } from 'lucide-react';

import { listMyTags, setActivityTags } from '@/lib/actions/tags';
import { addTags, MAX_TAGS, removeTag, suggestTags } from '@/lib/tags';

/**
 * The details' tag editor (spec 4.2): chips, a text box where Enter or a
 * comma adds a tag (Backspace on an empty box removes the last), and
 * suggestions from every tag you already use. Changes save right away.
 */
export function TagInput({
  activityId,
  initial,
  disabled = false,
}: {
  activityId: string;
  initial: string[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [tags, setTags] = useState(initial);
  const [text, setText] = useState('');
  const [known, setKnown] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputId = useId();
  const listId = `${inputId}-suggestions`;

  useEffect(() => {
    let live = true;
    listMyTags().then(
      (all) => live && setKnown(all),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  async function save(next: string[]) {
    const prev = tags;
    setTags(next);
    setSaving(true);
    try {
      const res = await setActivityTags(activityId, next);
      if (!res.ok) throw new Error(res.error);
      setTags(res.tags ?? next);
      setKnown((k) => addTags(k, (res.tags ?? next).join(',')));
      router.refresh();
    } catch (err) {
      setTags(prev);
      toast.error(err instanceof Error && err.message ? err.message : 'Could not save the tags.');
    } finally {
      setSaving(false);
    }
  }

  function commit(value: string) {
    setText('');
    const next = addTags(tags, value);
    if (next.length !== tags.length || next.some((t, i) => t !== tags[i])) void save(next);
  }

  const suggestions = focused ? suggestTags(known, tags, text, 6) : [];
  const full = tags.length >= MAX_TAGS;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="flex items-center gap-1.5 text-sm font-medium">
        <Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        Tags
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
          >
            {t}
            <button
              type="button"
              onClick={() => void save(removeTag(tags, t))}
              disabled={disabled || saving}
              aria-label={`Remove tag ${t}`}
              className="-mr-1 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50 sm:h-4 sm:w-4"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={text}
          disabled={disabled || full || saving}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(',')) commit(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (text.trim()) commit(text);
            } else if (e.key === 'Backspace' && !text && tags.length > 0) {
              void save(tags.slice(0, -1));
            }
          }}
          onFocus={() => setFocused(true)}
          // Delay so a click on a suggestion lands first.
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={full ? `Up to ${MAX_TAGS} tags` : tags.length ? 'Add…' : 'Add a tag…'}
          aria-controls={suggestions.length ? listId : undefined}
          autoComplete="off"
          // text-base on phones stops iOS zooming the page on focus (<16px does).
          className="min-w-[6rem] flex-1 bg-transparent py-0.5 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed sm:text-sm"
        />
      </div>
      {suggestions.length > 0 && (
        <ul id={listId} aria-label="Your tags" className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(s)}
                disabled={disabled || saving}
                className="rounded-full border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-solid hover:text-foreground sm:py-0.5"
              >
                + {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
