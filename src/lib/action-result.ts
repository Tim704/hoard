// ───────────────────────────────────────────────────────────────────────────
//  A server action's answer, made safe to read. Next 14 resolves an action
//  with `undefined` when the response isn't an RSC payload — a 502 or 524
//  page from the Cloudflare tunnel while the container restarts — and a
//  network failure rejects. Either way the caller would read `.ok` off
//  nothing (or skip its toast); settle() turns both into a failed result
//  with a message to show. Pure, client-safe.
// ───────────────────────────────────────────────────────────────────────────

/** What an action answers with: at least `ok`, and an error to show when not. */
export interface ActionLike {
  ok: boolean;
  error?: string;
}

/** Shown when Hoard didn't answer (an error page, no network). */
export const UNREACHABLE = 'Couldn’t reach Hoard. Try again.';

/** The action's own result, or a failure in its shape (its other fields absent). */
export type Settled<T extends ActionLike> = T | (Partial<Omit<T, 'ok' | 'error'>> & { ok: false; error: string });

/**
 * `await settle(updatePrefs(patch))`: the action's result as it answered, or
 * `{ ok: false, error: UNREACHABLE }` when it resolved with nothing, rejected,
 * or threw.
 */
export async function settle<T extends ActionLike>(action: PromiseLike<T | undefined | null>): Promise<Settled<T>> {
  // Every other field of T is optional in the failure, so this one fits any T.
  const unreachable = { ok: false, error: UNREACHABLE } as Settled<T>;
  try {
    const res = await action;
    return res == null || typeof res !== 'object' ? unreachable : res;
  } catch {
    return unreachable;
  }
}
