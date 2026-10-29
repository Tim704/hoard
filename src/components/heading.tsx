// The heading levels a reused section takes on a title's full page, where
// every panel has an h2 under the page's h1 (src/components/title/title-page.tsx).
// Without a level, a section keeps its own markup (the short popup's).

export type HeadingLevel = 2 | 3 | 4;

const TAGS = { 2: 'h2', 3: 'h3', 4: 'h4' } as const;

/** An h2–h4 by number. */
export function Heading({
  level,
  className,
  id,
  children,
}: {
  level: HeadingLevel;
  className?: string;
  id?: string;
  children: React.ReactNode;
}) {
  const Tag = TAGS[level];
  return (
    <Tag id={id} className={className}>
      {children}
    </Tag>
  );
}

/**
 * A field's label made the heading of its panel: wrapped in an unstyled
 * heading, so it looks just as it did (and stays the field's label). Without
 * a level, the label alone.
 */
export function LabelHeading({ level, children }: { level?: HeadingLevel; children: React.ReactNode }) {
  if (!level) return <>{children}</>;
  return <Heading level={level}>{children}</Heading>;
}
