import { ViewsClient } from '@/components/views-client';
import { getFranchiseOptions } from '@/lib/data';
import { getSavedViews, getViewLibrary } from '@/lib/data-views';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Views · Hoard' };

/** Saved views (spec 8.6): `/views` builds a new one, `/views?view=<id>` opens a saved one. */
export default async function ViewsPage({ searchParams }: { searchParams: { view?: string | string[] } }) {
  const user = await requireUser();
  const [views, library, franchises] = await Promise.all([
    getSavedViews(user.id),
    getViewLibrary(user.id),
    getFranchiseOptions(),
  ]);
  const wanted = typeof searchParams.view === 'string' ? searchParams.view : null;
  const selected = views.find((v) => v.id === wanted) ?? null;
  return (
    // A fresh builder per view, so switching views resets the filters.
    <ViewsClient key={selected?.id ?? 'new'} views={views} selected={selected} library={library} franchises={franchises} />
  );
}
