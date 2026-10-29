// ───────────────────────────────────────────────────────────────────────────
//  A server action's answer, made safe to read. Next 14 resolves an action
//  with `undefined` when the response isn't an RSC payload — a 502 or 524
//  page from the Cloudflare tunnel while the container restarts — a network
//  failure rejects with a TypeError (fetch's), and an action that throws on
//  the server rejects with an Error. The caller would read `.ok` off nothing
//  (or skip its toast); settle() turns each into a failed result with a
//  message to show: "Couldn’t reach Hoard" when Hoard didn't answer,
//  "Something went wrong" for anything else. Pure, client-safe.
// ───────────────────────────────────────────────────────────────────────────

/** What an action answers with: at least `ok`, and an error to show when not. */
export interface ActionLike {
  ok: boolean;
  error?: string;
}

/** Shown when Hoard didn't answer (an error page, no network). */
export const UNREACHABLE = 'Couldn’t reach Hoard. Try again.';

/** Shown when the action failed any other way (it threw, on the server or here). */
export const WENT_WRONG = 'Something went wrong. Try again.';

/** The action's own result, or a failure in its shape (its other fields absent). */
export type Settled<T extends ActionLike> = T | (Partial<Omit<T, 'ok' | 'error'>> & { ok: false; error: string });

/**
 * `await settle(updatePrefs(patch))`: the action's result as it answered;
 * `{ ok: false, error: UNREACHABLE }` when it resolved with something that
 * isn't an answer (an error page) or rejected with a TypeError (the network);
 * `{ ok: false, error: WENT_WRONG }` when it rejected or threw anything else.
 */
export async function settle<T extends ActionLike>(action: PromiseLike<T | undefined | null>): Promise<Settled<T>> {
  // Every other field of T is optional in the failure, so this fits any T.
  const failed = (error: string) => ({ ok: false, error }) as Settled<T>;
  try {
    const res = await action;
    return res == null || typeof res !== 'object' ? failed(UNREACHABLE) : res;
  } catch (err) {
    return failed(err instanceof TypeError ? UNREACHABLE : WENT_WRONG);
  }
}
