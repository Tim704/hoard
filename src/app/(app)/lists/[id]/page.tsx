import { notFound } from 'next/navigation';

import { CustomListClient } from '@/components/custom-list-client';
import { getCustomList } from '@/lib/data-lists';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'List · Hoard' };

/** One custom list (spec 4.11), for its owner and members only. */
export default async function CustomListPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const list = await getCustomList(params.id, user.id);
  if (!list) notFound();
  return <CustomListClient list={list} me={user.id} />;
}
