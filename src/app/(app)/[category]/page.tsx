import { notFound } from 'next/navigation';

import { CategoryClient } from '@/components/category-client';
import { getCategory } from '@/lib/categories';
import { getCategoryActivities, getFranchiseOptions } from '@/lib/data';

interface CategoryPageProps {
  // Next 14: route params are a plain object (not a Promise).
  params: { category: string };
  searchParams: { score?: string; open?: string };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const config = getCategory(params.category);
  if (!config) notFound();

  const [activities, franchises] = await Promise.all([
    getCategoryActivities(config.slug),
    getFranchiseOptions(),
  ]);

  return (
    <CategoryClient
      slug={config.slug}
      config={config}
      activities={activities}
      franchises={franchises}
      scoreOpen={searchParams.score === '1'}
      openId={typeof searchParams.open === 'string' ? searchParams.open : undefined}
    />
  );
}
