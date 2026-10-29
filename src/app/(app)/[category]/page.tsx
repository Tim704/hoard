import { notFound, redirect } from 'next/navigation';

import { CategoryClient } from '@/components/category-client';
import { getCategory } from '@/lib/categories';
import { getCategoryActivities, getOwnedTitleRef } from '@/lib/data';
import { getCurrentPrefs } from '@/lib/data-prefs';
import { normalizeTags } from '@/lib/tags';
import { openRedirect } from '@/lib/title-href';

interface CategoryPageProps {
  // Next 14: route params are a plain object (not a Promise).
  params: { category: string };
  searchParams: { open?: string; t?: string; tag?: string | string[] };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const config = getCategory(params.category);
  if (!config) notFound();

  // `?open=<id>` is the universal link to a title (notifications, iCal, the
  // palette): with the "Full page" title view it goes to the title's page.
  const open = typeof searchParams.open === 'string' ? searchParams.open : undefined;
  if (open) {
    const { titleView } = await getCurrentPrefs();
    const to = titleView === 'page' ? openRedirect(titleView, await getOwnedTitleRef(open)) : null;
    if (to) redirect(to);
  }

  const activities = await getCategoryActivities(config.slug);

  return (
    <CategoryClient
      slug={config.slug}
      config={config}
      activities={activities}
      openId={open}
      openNonce={typeof searchParams.t === 'string' ? searchParams.t : undefined}
      initialTags={normalizeTags([searchParams.tag ?? []].flat())}
    />
  );
}
