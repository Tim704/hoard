// ───────────────────────────────────────────────────────────────────────────
//  The full JSON export (spec 1.11, completed in 8.4): everything the user
//  owns, shaped from raw rows. Pure — src/lib/data-export.ts loads the rows.
//
//  What never leaves: password hashes and sessions (not loaded at all), the
//  `userId` column on every row (it is always the exporting user), API token
//  hashes (only name and dates), linked accounts' OAuth tokens and any
//  token- or secret-like key in their provider data, and share links' ids
//  (the id IS the public token; only kind, target and dates are exported).
// ───────────────────────────────────────────────────────────────────────────

import type { Prefs } from './prefs';
import { exportablePrefs } from './export';

type Row = Record<string, unknown>;

/** A row without the given keys (and never `userId`). */
function omit(row: Row, ...keys: string[]): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'userId' || keys.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Keys in provider data that might hold a credential. */
const SECRET_KEY = /token|secret|password|session|cookie|key$/i;

/** Provider data minus anything credential-like (one level deep is all it has). */
export function scrubLinkData(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data ?? null;
  const out: Row = {};
  for (const [k, v] of Object.entries(data as Row)) {
    if (SECRET_KEY.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export interface FullExportInput {
  user: { username: string; createdAt: Date | string } | null;
  prefs: Prefs;
  /** Activity rows, already shaped (section + media). */
  activities: Row[];
  events: Row[];
  franchises: Row[];
  diaryEntries: Row[];
  playSessions: Row[];
  /** SeasonActivity rows with their `season` (TvSeason) included. */
  seasonActivities: (Row & { season?: Row | null })[];
  yearDuelScores: Row[];
  /** Owned custom lists with items (already titled) and members (with usernames). */
  customLists: (Row & { items: Row[]; members: Row[] })[];
  refLists: (Row & { items: Row[] })[];
  goals: Row[];
  savedViews: Row[];
  apiTokens: Row[];
  externalLinks: Row[];
  tasteProfile: Row | null;
  shareLinks: Row[];
}

export function shapeFullExport(input: FullExportInput, now = new Date()) {
  return {
    format: 'hoard-export',
    version: 2,
    exportedAt: now.toISOString(),
    user: input.user ? { username: input.user.username, createdAt: input.user.createdAt } : null,
    prefs: exportablePrefs(input.prefs),
    activities: input.activities.map((a) => omit(a)),
    events: input.events.map((e) => omit(e)),
    franchises: input.franchises.map((f) => omit(f)),
    diaryEntries: input.diaryEntries.map((d) => omit(d)),
    playSessions: input.playSessions.map((p) => omit(p)),
    seasonActivities: input.seasonActivities.map(({ season, ...s }) => ({
      ...omit(s),
      season: season
        ? { seasonNumber: season.seasonNumber ?? null, name: season.name ?? null, episodeCount: season.episodeCount ?? null }
        : null,
    })),
    yearDuelScores: input.yearDuelScores.map((y) => omit(y)),
    customLists: input.customLists.map(({ items, members, ...l }) => ({
      ...omit(l, 'ownerId'),
      items: items.map((i) => omit(i, 'listId', 'addedById')),
      members: members.map((m) => omit(m, 'listId', 'id')),
    })),
    refLists: input.refLists.map(({ items, ...l }) => ({
      ...omit(l),
      items: items.map((i) => omit(i, 'listId')),
    })),
    goals: input.goals.map((g) => omit(g)),
    savedViews: input.savedViews.map((v) => omit(v)),
    apiTokens: input.apiTokens.map((t) => ({
      name: t.name ?? null,
      createdAt: t.createdAt ?? null,
      lastUsedAt: t.lastUsedAt ?? null,
    })),
    externalLinks: input.externalLinks.map((l) => ({
      provider: l.provider ?? null,
      accountId: l.accountId ?? null,
      data: scrubLinkData(l.data),
      updatedAt: l.updatedAt ?? null,
    })),
    tasteProfile: input.tasteProfile
      ? { data: input.tasteProfile.data ?? null, updatedAt: input.tasteProfile.updatedAt ?? null }
      : null,
    shareLinks: input.shareLinks.map((s) => ({
      kind: s.kind ?? null,
      target: s.target ?? null,
      createdAt: s.createdAt ?? null,
      revokedAt: s.revokedAt ?? null,
    })),
  };
}
