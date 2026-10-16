'use client';

// ───────────────────────────────────────────────────────────────────────────
//  Shared login / register form. Drives the matching auth server action through
//  `useFormState`; the submit button reflects the pending state via
//  `useFormStatus` (both imported from react-dom, per Next 14).
// ───────────────────────────────────────────────────────────────────────────

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, registerAction } from '@/lib/actions/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface AuthFormProps {
  mode: 'login' | 'register';
}

const initialState: { error?: string } = {};

/** The submit button, isolated so `useFormStatus` reads the parent <form>. */
function SubmitButton({ mode }: AuthFormProps) {
  const { pending } = useFormStatus();
  const idleLabel = mode === 'login' ? 'Sign in' : 'Create account';
  const busyLabel = mode === 'login' ? 'Signing in…' : 'Creating account…';

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? busyLabel : idleLabel}
    </Button>
  );
}

export function AuthForm({ mode }: AuthFormProps) {
  const action = mode === 'login' ? loginAction : registerAction;
  const [state, formAction] = useFormState(action, initialState);

  const subtitle =
    mode === 'login'
      ? 'Sign in to tend your ever-growing hoard.'
      : 'Create an account and start hoarding.';

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          Welcome to HOARD
        </CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              minLength={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
            />
          </div>

          {state.error ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}

          <SubmitButton mode={mode} />
        </form>
      </CardContent>
    </Card>
  );
}
