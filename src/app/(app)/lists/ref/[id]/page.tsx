import { notFound } from 'next/navigation';

import { RefListClient } from '@/components/ref-list-client';
import { getRefList } from '@/lib/data-reflists';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Reference list · Hoard' };

/** One of your reference lists (spec 4.8): progress, filter and add buttons. */
export default async function RefListPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const list = await getRefList(params.id, user.id);
  if (!list) notFound();
  return <RefListClient list={list} />;
}
