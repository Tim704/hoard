'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { refreshTasteProfile } from '@/lib/actions/taste';

/** "Refresh" on /stats → Taste (7.2): rebuilds your taste profile now. */
export function TasteRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const res = await refreshTasteProfile().catch(() => ({ ok: false, error: 'Could not build your taste profile.' }));
      if (!res.ok) {
        toast.error(res.error ?? 'Could not build your taste profile.');
        return;
      }
      toast.success('Taste profile updated.');
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={pending}>
      {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
      Refresh
    </Button>
  );
}
