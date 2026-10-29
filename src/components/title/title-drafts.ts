'use client';

// Unsaved edits on a title page, kept for this browser tab (sessionStorage,
// with an in-memory copy when storage is unavailable): leaving the page with
// edits keeps them, and the page shows them again, still unsaved. The popup
// hands its edits over the same way ("Open full page"). Rules: src/lib/title-draft.ts.

import { parseDraft, type TitleDraft } from '@/lib/title-draft';

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
