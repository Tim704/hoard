'use client';

import Link from 'next/link';

type CardActionProps = {
  /** Where the card goes (the title's page): a real link — new tab, prefetch, read as a link. */
  href?: string;
  /** Without `href`: what the card does when pressed (opens the popup). */
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
} & { [data: `data-${string}`]: string | undefined };

/**
 * The clickable root of a card or row: a link when it goes to a page, a
 * button when it opens something in place. Same classes either way, so the
 * look, focus ring and accessible name don't change.
 */
export function CardAction({ href, onClick, children, ...rest }: CardActionProps) {
  if (href) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} {...rest}>
      {children}
    </button>
  );
}
