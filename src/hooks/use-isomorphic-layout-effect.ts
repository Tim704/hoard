import { useEffect, useLayoutEffect } from 'react';

/** useLayoutEffect in the browser (before paint), useEffect on the server (where neither runs). */
export const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
