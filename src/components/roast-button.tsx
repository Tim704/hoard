'use client';

import { useState, useTransition } from 'react';
import { Flame, Gem, Loader2 } from 'lucide-react';

import type { CategorySlug } from '@/lib/categories';
import type { RoastMode } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useFocusReturn } from '@/hooks/use-focus-return';
import { roastList } from '@/lib/actions/roast';

/** The critic's two modes, as menu entries (the toolbar's AI Critic menu and its More menu). */
export const ROAST_ACTIONS: { mode: RoastMode; label: string; Icon: typeof Flame }[] = [
  { mode: 'roast', label: 'Roast my taste', Icon: Flame },
  { mode: 'recommend', label: 'Recommend a gem', Icon: Gem },
];

const MODE_META: Record<RoastMode, { title: string; description: string }> = {
  roast: {
    title: 'Roasting your taste',
    description: 'A savage, witty critic weighs in on your hoard.',
  },
  recommend: {
    title: 'A hidden gem for you',
    description: 'A tasteful curator suggests something you probably missed.',
  },
};

/**
 * The AI taste critic. `run(mode)` (roast vs. recommend) calls the
 * `roastList` server action and shows the result in `dialog` (render it once)
 * with a loading state and graceful error handling. The section toolbar
 * offers the modes from its AI Critic menu and, when that is folded away,
 * from its More menu.
 */
export function useRoastCritic(slug: CategorySlug): { run: (mode: RoastMode) => void; dialog: React.ReactNode } {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RoastMode>('roast');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  // Opened from a menu (no DialogTrigger): hand focus back to the opener.
  const { remember, restore } = useFocusReturn();

  function run(selected: RoastMode) {
    remember();
    setMode(selected);
    setText('');
    setError(undefined);
    setOpen(true);
    startTransition(async () => {
      const result = await roastList(slug, selected);
      setText(result.text);
      setError(result.error);
    });
  }

  const meta = MODE_META[mode];

  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Mobile: dock to the bottom edge as a sheet; sm+ restores the centered dialog. */}
      <DialogContent
        onCloseAutoFocus={restore}
        className="bottom-0 top-auto max-h-[92dvh] max-w-full translate-y-0 rounded-t-2xl border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-auto sm:top-[50%] sm:max-h-none sm:max-w-lg sm:translate-y-[-50%] sm:border-b sm:p-6"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'roast' ? (
              <Flame className="h-5 w-5 text-orange-400" aria-hidden />
            ) : (
              <Gem className="h-5 w-5 text-emerald-400" aria-hidden />
            )}
            {meta.title}
          </DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Consulting the AI critic…
          </div>
        ) : error ? (
          <p className="py-4 text-sm text-destructive">{error}</p>
        ) : (
          <p className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
            {text}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );

  return { run, dialog };
}
