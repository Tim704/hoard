// ───────────────────────────────────────────────────────────────────────────
//  What a server action may tell the browser when something throws (final
//  review M4). Messages the code writes on purpose for the user are thrown as
//  `UserError` and passed on; anything else (a Prisma error, a provider's raw
//  response, a stack detail) is logged on the server and replaced by the
//  action's generic fallback. Next's own control-flow errors (redirect,
//  notFound) are re-thrown so they still work.
// ───────────────────────────────────────────────────────────────────────────

/** An error whose message is written for the user and safe to show. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

function isNextControl(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND');
}

/** The message to return for `err`: a UserError's own, else `fallback` (and the error is logged). */
export function publicError(err: unknown, fallback: string): string {
  if (isNextControl(err)) throw err;
  if (err instanceof UserError) return err.message;
  console.error('[%s]', fallback, err);
  return fallback;
}
