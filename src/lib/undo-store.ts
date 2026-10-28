// ───────────────────────────────────────────────────────────────────────────
//  Server-side holding area for "Remove" undo snapshots (spec 1.6, G2). The
//  client only gets a random token; the snapshot never leaves the server, so
//  Undo can't be used to write rows the user doesn't own. Entries live for two
//  minutes (the toast shows for 8 s) and the map is bounded, oldest evicted
//  first. In memory, per process: Hoard runs as one container, and a restart
//  simply means "Too late to undo". Deliberately NOT a 'use server' module.
// ───────────────────────────────────────────────────────────────────────────

import { randomBytes } from 'node:crypto';

import type { ActivitySnapshot } from './undo';

export const UNDO_TTL_MS = 2 * 60 * 1000;
export const UNDO_MAX_ENTRIES = 200;

interface Entry {
  userId: string;
  snapshot: ActivitySnapshot;
  expiresAt: number;
}

/** A store instance (exported as a class so tests get a fresh one). */
export class UndoStore {
  // Map iteration order is insertion order, so the first key is the oldest.
  private entries = new Map<string, Entry>();

  constructor(
    private ttlMs = UNDO_TTL_MS,
    private maxEntries = UNDO_MAX_ENTRIES,
  ) {}

  /** Keep a snapshot for `userId`; returns the token the client gets. */
  put(userId: string, snapshot: ActivitySnapshot, now = Date.now()): string {
    this.prune(now);
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    const token = randomBytes(18).toString('base64url');
    this.entries.set(token, { userId, snapshot, expiresAt: now + this.ttlMs });
    return token;
  }

  /** The snapshot behind a token, only for its own user and only while fresh. */
  get(token: string, userId: string, now = Date.now()): ActivitySnapshot | null {
    const entry = this.entries.get(token);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.entries.delete(token);
      return null;
    }
    return entry.userId === userId ? entry.snapshot : null;
  }

  /** Forget a token (after a successful restore). */
  drop(token: string): void {
    this.entries.delete(token);
  }

  get size(): number {
    return this.entries.size;
  }

  private prune(now: number): void {
    for (const [token, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(token);
    }
  }
}

// One store per server process, kept across dev hot reloads.
const globalForUndo = globalThis as unknown as { hoardUndoStore?: UndoStore };
export const undoStore = (globalForUndo.hoardUndoStore ??= new UndoStore());
