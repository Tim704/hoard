'use client';

import { forwardRef, useCallback } from 'react';
import Link from 'next/link';

import { usePrefs } from '@/components/prefs-provider';
import { titleHref } from '@/lib/title-href';

/**
 * `(slug, id, {nonce}) => href` in the user's title view (popup or page),
 * following a switch in Settings → Themes at once.
 */
export function useTitleHref(): (slug: string, id: string, opts?: { nonce?: string }) => string {
  const { titleView } = usePrefs();
  return useCallback((slug, id, opts) => titleHref(slug, id, titleView, opts), [titleView]);
}

type TitleLinkProps = Omit<React.ComponentPropsWithoutRef<typeof Link>, 'href'> & {
  /** The title's section. */
  slug: string;
  /** Its activity id. */
  id: string;
};

/** A link that opens a title the way the user chose (its popup or its page); usable from server components. */
export const TitleLink = forwardRef<HTMLAnchorElement, TitleLinkProps>(function TitleLink({ slug, id, ...props }, ref) {
  const href = useTitleHref()(slug, id);
  return <Link ref={ref} href={href} {...props} />;
});
