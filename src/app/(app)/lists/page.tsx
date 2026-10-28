import { ListsClient, type ListsTab } from '@/components/lists-client';
import { getMyLists } from '@/lib/data-lists';
import { getRefLists } from '@/lib/data-reflists';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Lists · Hoard' };

/**
 * `/lists`: your own custom lists, the ones shared with you (4.11), and
 * reference lists to work through (4.8).
 */
export default async function ListsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await requireUser();
  const tab: ListsTab = searchParams.tab === 'shared' ? 'shared' : searchParams.tab === 'ref' ? 'ref' : 'mine';
  const [custom, ref] = await Promise.all([getMyLists(user.id), getRefLists(user.id)]);
  return (
    <ListsClient
      tab={tab}
      mine={custom.mine}
      shared={custom.shared}
      refLists={ref.lists}
      builtins={ref.builtins}
      aiConfigured={Boolean(process.env.GEMINI_API_KEY)}
    />
  );
}
