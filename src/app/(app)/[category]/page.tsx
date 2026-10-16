import { notFound } from 'next/navigation';

import { CategoryClient } from '@/components/category-client';
import { getCategory } from '@/lib/categories';
import { getCategoryActivities } from '@/lib/data';

interface CategoryPageProps {
  // Next 14: route params are a plain object (not a Promise).
  params: { category: string };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const config = getCategory(params.category);
  if (!config) notFound();

  const activities = await getCategoryActivities(config.slug);

  return (
    <CategoryClient slug={config.slug} config={config} activities={activities} />
  );
}
