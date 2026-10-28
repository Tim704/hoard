'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ListPlus, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addActivityToList, listEditableLists } from '@/lib/actions/lists';

/**
 * "Add to list…" in a title's details (spec 4.11): pick one of your lists
 * (or one you edit) and put this title on it. The lists load on first open.
 */
export function AddToList({ activityId, disabled = false }: { activityId: string; disabled?: boolean }) {
  const [lists, setLists] = useState<{ id: string; name: string }[] | null>(null);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);

  async function openPicker() {
    setOpen(true);
    if (lists) return;
    setBusy(true);
    try {
      const all = await listEditableLists();
      setLists(all);
      if (all.length === 1) setChoice(all[0].id);
    } catch {
      toast.error('Could not load your lists.');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!choice) return;
    setBusy(true);
    try {
      const res = await addActivityToList(choice, activityId);
      const name = lists?.find((l) => l.id === choice)?.name ?? 'the list';
      if (!res.ok) toast.error(res.error ?? 'Could not add it.');
      else if (res.existing) toast.info(`Already on “${name}”.`);
      else {
        toast.success(`Added to “${name}”.`);
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void openPicker()}>
        <ListPlus className="mr-2 h-4 w-4" aria-hidden />
        Add to list…
      </Button>
    );
  }
  if (lists && lists.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You have no lists yet.{' '}
        <Link href="/lists" className="underline underline-offset-2">
          Make one
        </Link>
        , then add titles to it from here.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={choice} onValueChange={setChoice} disabled={busy || !lists}>
        <SelectTrigger className="min-w-0 flex-1 basis-40" aria-label="List">
          <SelectValue placeholder={lists ? 'Pick a list…' : 'Loading…'} />
        </SelectTrigger>
        <SelectContent>
          {(lists ?? []).map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" size="sm" disabled={busy || !choice} onClick={() => void add()}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
        Add
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
