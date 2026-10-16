'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Authentication server actions, shaped for `useFormState`: each form action
//  takes (prevState, formData) and returns `{ error?: string }`.
//
//  IMPORTANT: redirect() throws a NEXT_REDIRECT control-flow error, so it is
//  called OUTSIDE the try/catch — otherwise the catch would swallow it and the
//  navigation would never happen.
// ───────────────────────────────────────────────────────────────────────────

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { authenticate, createUser } from '@/lib/auth';
import { createSessionForUser, destroySession } from '@/lib/session';

const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

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
    const parsed = credentialsSchema.safeParse({
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
      error: err instanceof Error ? err.message : 'Could not create that account.',
    };
  }

  // Outside the try/catch: redirect() throws NEXT_REDIRECT by design.
  if (succeeded) {
    redirect('/dashboard');
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
    redirect('/dashboard');
  }
  return {};
}

/** Sign out: destroy the session and return to the login page. */
export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}
