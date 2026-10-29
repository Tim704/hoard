'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Settings2 } from 'lucide-react';

import { HeaderButton } from '@/components/dashboard/header-button';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DashboardTilesPref } from '@/lib/dashboard-tiles';

// The editor (and dnd-kit) loads when the dialog first opens, or when the
// pointer or focus reaches the button: not with every dashboard.
const loadEditor = () => import('@/components/dashboard/tile-editor');
const TileEditor = dynamic(() => loadEditor().then((m) => m.TileEditor), {
  ssr: false,
  loading: () => (
    <p role="status" className="py-10 text-center text-sm text-muted-foreground">
      Loading the tiles…
    </p>
  ),
});
const preload = () => {
  void loadEditor().catch(() => {});
};

/**
 * The dashboard's Customize button and its dialog (a bottom sheet on phones,
 * like the title popup) with the tile editor. `empty`: the plain labelled
 * button of the empty dashboard. Closing the dialog drops unsaved changes.
 */
export function CustomizeDashboard({ saved, empty = false }: { saved: DashboardTilesPref; empty?: boolean }) {
  const [open, setOpen] = useState(false);
  const dragging = useRef(false);
  const trigger = { onClick: () => setOpen(true), onPointerEnter: preload, onFocus: preload };

  return (
    <>
      {empty ? (
        <Button type="button" variant="outline" {...trigger}>
          <Settings2 className="mr-2 h-4 w-4" aria-hidden />
          Customize
        </Button>
      ) : (
        <HeaderButton icon={Settings2} label="Customize" name="Customize dashboard" labelAt="sm+xl" {...trigger} />
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          // Escape while dragging a tile cancels the drag, not the dialog.
          onEscapeKeyDown={(e) => {
            if (dragging.current) e.preventDefault();
          }}
          className="bottom-0 top-auto flex max-h-[92dvh] max-w-full translate-y-0 flex-col overflow-hidden rounded-t-2xl border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-auto sm:top-[50%] sm:max-h-[90dvh] sm:max-w-lg sm:translate-y-[-50%] sm:border-b sm:p-6"
        >
          <DialogHeader className="pr-6 text-left">
            <DialogTitle>Customize dashboard</DialogTitle>
            <DialogDescription>Pick the tiles to show and their order: drag a tile or use its arrows, then Save.</DialogDescription>
          </DialogHeader>
          <TileEditor
            saved={saved}
            onClose={() => setOpen(false)}
            onDragging={(d) => {
              dragging.current = d;
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
