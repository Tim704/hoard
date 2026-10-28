'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Authentication server actions, shaped for `useFormState`: each form action
//  takes (prevState, formData) and returns `{ error?: string }`.
//
//  IMPORTANT: redirect() throws a NEXT_REDIRECT control-flow error, so it is
//  called OUTSIDE the try/catch — otherwise the catch would swallow it and the
//  navigation would never happen.
// ───────────────────────────────────────────────────────────────────────────

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { authenticate, createUser } from '@/lib/auth';
import { safeNextPath } from '@/lib/safe-next';
import { createSessionForUser, destroySession } from '@/lib/session';
import { publicError } from '@/lib/action-error';
import { clientIp } from '@/lib/api-auth';
import { takeLoginRate, takeRegisterRate, usernameProblem } from '@/lib/auth-rules';

const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

/** New accounts: the username rules (3–32 of [A-Za-z0-9_.-]) on top. */
const registerSchema = credentialsSchema.superRefine((v, ctx) => {
  const problem = usernameProblem(v.username);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['username'], message: problem });
});

const requestIp = () => clientIp(headers());

interface AuthState {
  error?: string;
}

/**
 * Register a new account, sign in, and head to the dashboard.
 * Returns `{ error }` on validation/creation failure.
 */
export async function registerAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  let succeeded = false;

  try {
    const limited = takeRegisterRate(requestIp());
    if (limited) return { error: limited };

    const parsed = registerSchema.safeParse({
      username: formData.get('username'),
      password: formData.get('password'),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }

    const user = await createUser(parsed.data.username, parsed.data.password);
    await createSessionForUser(user.id);
    succeeded = true;
  } catch (err) {
    return {
      error: publicError(err, 'Could not create that account.'),
    };
  }

  // Outside the try/catch: redirect() throws NEXT_REDIRECT by design.
  if (succeeded) {
    // Back to where the visitor was headed (same-site paths only).
    redirect(safeNextPath(formData.get('next')) ?? '/dashboard');
  }
  return {};
}

/**
 * Sign in with existing credentials and head to the dashboard.
 * Returns a generic error on failure (no user enumeration).
 */
export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  let succeeded = false;

  try {
    const parsed = credentialsSchema.safeParse({
      username: formData.get('username'),
      password: formData.get('password'),
    });

    if (!parsed.success) {
      return { error: 'Invalid username or password' };
    }
    const limited = takeLoginRate(parsed.data.username, requestIp());
    if (limited) return { error: limited };

    const user = await authenticate(parsed.data.username, parsed.data.password);
    if (!user) {
      return { error: 'Invalid username or password' };
    }

    await createSessionForUser(user.id);
    succeeded = true;
  } catch {
    return { error: 'Invalid username or password' };
  }

  // Outside the try/catch: redirect() throws NEXT_REDIRECT by design.
  if (succeeded) {
    // Back to where the visitor was headed (same-site paths only).
    redirect(safeNextPath(formData.get('next')) ?? '/dashboard');
  }
  return {};
}

/** Sign out: destroy the session and return to the login page. */
export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}
