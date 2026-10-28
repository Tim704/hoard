import { describe, expect, it } from 'vitest';

import { CATEGORY_SLUGS, getCategory, isCategorySlug } from './categories';

describe('isCategorySlug / getCategory (the [category] page guard)', () => {
  it('accepts every real section', () => {
    for (const slug of CATEGORY_SLUGS) {
      expect(isCategorySlug(slug)).toBe(true);
      expect(getCategory(slug)?.slug).toBe(slug);
    }
  });

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf', 'podcasts', ''])(
    'refuses %j, so /%s is a 404',
    (slug) => {
      expect(isCategorySlug(slug)).toBe(false);
      expect(getCategory(slug)).toBeUndefined();
    },
  );
});
