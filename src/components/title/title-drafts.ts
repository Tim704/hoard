'use client';

// Unsaved edits on a title page, kept for this browser tab (sessionStorage,
// with an in-memory copy when storage is unavailable): leaving the page with
// edits keeps them, and the page shows them again, still unsaved. The popup
// hands its edits over the same way ("Open full page"), merged into any kept
// ones; a popup save drops from them only what it wrote. Rules:
// src/lib/title-draft.ts.

import { mergeDraft, parseDraft, pruneDraft, type TitleDraft, type TitleValues } from '@/lib/title-draft';

const PREFIX = 'hoard:title-draft:';
const memory = new Map<string, string>();

export function readTitleDraft(id: string): TitleDraft | null {
  const key = PREFIX + id;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(key);
  } catch {
    // Storage blocked: the in-memory copy below.
  }
  return parseDraft(raw ?? memory.get(key) ?? null);
}

export function writeTitleDraft(id: string, draft: TitleDraft): void {
  const key = PREFIX + id;
  const raw = JSON.stringify(draft);
  memory.set(key, raw);
  try {
    window.sessionStorage.setItem(key, raw);
  } catch {
    // Kept in memory for this visit.
  }
}

export function clearTitleDraft(id: string): void {
  const key = PREFIX + id;
  memory.delete(key);
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing stored.
  }
}

/** Merges `draft`'s edits into the kept ones (its edits win a field both edited). */
export function mergeTitleDraft(id: string, draft: TitleDraft): void {
  writeTitleDraft(id, mergeDraft(readTitleDraft(id), draft));
}

/** A save wrote `fields`: they stop being kept edits; the draft goes once none are left. */
export function pruneTitleDraft(id: string, fields: readonly (keyof TitleValues)[]): void {
  const draft = readTitleDraft(id);
  if (!draft) return;
  const rest = pruneDraft(draft, fields);
  if (rest) writeTitleDraft(id, rest);
  else clearTitleDraft(id);
}
