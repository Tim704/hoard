import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { AuthForm } from '@/components/auth-form';
import { safeNextPath } from '@/lib/safe-next';
import { signupClosed } from '@/lib/auth-rules';

export default async function RegisterPage({ searchParams }: { searchParams: { next?: string | string[] } }) {
  const next = safeNextPath(Array.isArray(searchParams.next) ? searchParams.next[0] : searchParams.next);
  // Already signed in? Skip the form.
  if (await getCurrentUser()) {
    redirect(next ?? '/dashboard');
  }

  const closed = signupClosed();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      {closed ? (
        <p className="text-center text-sm text-muted-foreground">Sign-up is closed on this Hoard.</p>
      ) : (
        <AuthForm mode="register" next={next} />
      )}
      <p className="text-sm text-muted-foreground">
        {closed ? 'Have an account?' : 'Already hoarding?'}{' '}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  );
}
