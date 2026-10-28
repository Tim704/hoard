import { redirect } from 'next/navigation';

import { DiaryClient } from '@/components/diary-client';
import { getDiaryPage } from '@/lib/data-diary';

export const metadata = { title: 'Diary · Hoard' };

export default async function DiaryPage() {
  const data = await getDiaryPage();
  if (!data) redirect('/login');
  return <DiaryClient entries={data.entries} library={data.library} today={data.today} />;
}
