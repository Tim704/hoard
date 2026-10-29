import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { TitlePage } from '@/components/title/title-page';
import { CATEGORIES } from '@/lib/categories';
import { getActivity, getFranchiseOptions } from '@/lib/data';
import { getCurrentPrefs } from '@/lib/data-prefs';
import { displayTitle } from '@/lib/title';
import { titlePageOutcome } from '@/lib/title-href';

interface TitleRouteProps {
  // Next 14: route params are a plain object (not a Promise).
  params: { category: string; activityId: string };
}

export async function generateMetadata({ params }: TitleRouteProps): Promise<Metadata> {
  const activity = await getActivity(params.activityId);
  if (!activity) return { title: 'Not found · Hoard' };
  const { titleLanguage } = await getCurrentPrefs();
  return { title: `${displayTitle(activity.media, titleLanguage)} · Hoard` };
}

/**
 * `/<section>/title/<id>`: one of the caller's titles on its own page (the
 * "Full page" title view, and "Open full page" from the popup). A title
 * asked for under another section moves to its own; an unknown id, or
 * someone else's, is a 404.
 */
export default async function TitleRoute({ params }: TitleRouteProps) {
  // Both at once: a 404 or a redirect wastes the (small) franchise query.
  const [activity, franchises] = await Promise.all([getActivity(params.activityId), getFranchiseOptions()]);
  const outcome = titlePageOutcome(params.category, activity ? { id: activity.id, category: activity.category } : null);
  if (outcome.kind === 'redirect') redirect(outcome.href);
  if (outcome.kind === 'not-found' || !activity) notFound();

  return (
    <TitlePage
      key={activity.id}
      activity={activity}
      franchises={franchises}
      sectionLabel={CATEGORIES[activity.category].label}
    />
  );
}
