import type { Tier } from '@/lib/tiers';

/**
 * Tier accents for the read-only tier lists (the public share page and the
 * PNG export), matching the editor's rose → violet scale. Hex values, since
 * the PNG is drawn from inline styles.
 */
export const TIER_HEX: Record<Tier, string> = {
  S: '#f43f5e',
  A: '#f97316',
  B: '#f59e0b',
  C: '#10b981',
  D: '#0ea5e9',
  F: '#8b5cf6',
};
