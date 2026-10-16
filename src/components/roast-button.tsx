'use client';

import { useState, useTransition } from 'react';
import { Flame, Gem, Loader2, Sparkles } from 'lucide-react';

import type { CategorySlug } from '@/lib/categories';
import type { RoastMode } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { roastList } from '@/lib/actions/roast';

interface RoastButtonProps {
  slug: CategorySlug;
  /** Extra classes for the trigger button (lets the toolbar size/order it). */
  triggerClassName?: string;
}

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
 * The AI taste critic. A dropdown picks a mode (roast vs. recommend), each of
 * which calls the `roastList` server action and streams the result into a
 * dialog with a loading state and graceful error handling.
 */
export function RoastButton({ slug, triggerClassName }: RoastButtonProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RoastMode>('roast');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function run(selected: RoastMode) {
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={triggerClassName}>
            <Sparkles className="mr-2 h-4 w-4" aria-hidden />
            AI Critic
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => run('roast')}>
            <Flame className="mr-2 h-4 w-4" aria-hidden />
            Roast my taste
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run('recommend')}>
            <Gem className="mr-2 h-4 w-4" aria-hidden />
            Recommend a gem
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Mobile: dock to the bottom edge as a sheet; sm+ restores the centered dialog. */}
        <DialogContent className="bottom-0 top-auto max-h-[92dvh] max-w-full translate-y-0 rounded-t-2xl border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-auto sm:top-[50%] sm:max-h-none sm:max-w-lg sm:translate-y-[-50%] sm:border-b sm:p-6">
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
    </>
  );
}
