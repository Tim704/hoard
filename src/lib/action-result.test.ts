import { describe, expect, it } from 'vitest';

import { UNREACHABLE, WENT_WRONG, settle, type ActionLike } from './action-result';

describe('settle', () => {
  it('passes the action’s own answer through, success or failure', async () => {
    const ok = { ok: true, undoToken: 't1' };
    expect(await settle(Promise.resolve(ok))).toBe(ok);
    const failed = { ok: false, error: 'Not found.' };
    expect(await settle(Promise.resolve(failed))).toBe(failed);
    // A failure without a message stays as it is: the caller's own fallback applies.
    expect(await settle(Promise.resolve<ActionLike>({ ok: false }))).toEqual({ ok: false });
  });

  it('turns an answer that isn’t one (an error page from the tunnel) into a failure', async () => {
    expect(await settle(Promise.resolve(undefined))).toEqual({ ok: false, error: UNREACHABLE });
    expect(await settle(Promise.resolve(null))).toEqual({ ok: false, error: UNREACHABLE });
    expect(await settle(Promise.resolve('<html>502</html>' as unknown as ActionLike))).toEqual({ ok: false, error: UNREACHABLE });
  });

  it('says Hoard couldn’t be reached when the network failed (fetch’s TypeError)', async () => {
    expect(await settle(Promise.reject(new TypeError('Failed to fetch')))).toEqual({ ok: false, error: UNREACHABLE });
    const throwing = (async () => {
      throw new TypeError('NetworkError when attempting to fetch resource.');
    })();
    expect(await settle<ActionLike>(throwing)).toEqual({ ok: false, error: UNREACHABLE });
  });

  it('says something went wrong for any other rejection or throw', async () => {
    // An action that threw on the server rejects with a plain Error.
    expect(await settle(Promise.reject(new Error('An error occurred in the Server Components render.')))).toEqual({
      ok: false,
      error: WENT_WRONG,
    });
    expect(await settle(Promise.reject(new RangeError('Invalid time value')))).toEqual({ ok: false, error: WENT_WRONG });
    expect(await settle(Promise.reject('not an Error'))).toEqual({ ok: false, error: WENT_WRONG });
    const throwing = (async () => {
      throw new Error('boom');
    })();
    expect(await settle<ActionLike>(throwing)).toEqual({ ok: false, error: WENT_WRONG });
    expect(WENT_WRONG).toBe('Something went wrong. Try again.');
  });

  it('keeps the result’s other fields readable after a failure', async () => {
    const res = await settle(Promise.resolve<{ ok: boolean; error?: string; previous?: { status: string } } | undefined>(undefined));
    expect(res.ok).toBe(false);
    expect(res.previous).toBeUndefined();
    expect(UNREACHABLE).toBe('Couldn’t reach Hoard. Try again.');
  });
});
