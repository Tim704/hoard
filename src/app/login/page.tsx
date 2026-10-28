import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { AuthForm } from '@/components/auth-form';
import { safeNextPath } from '@/lib/safe-next';

export default async function LoginPage({ searchParams }: { searchParams: { next?: string | string[] } }) {
  // Where to go afterwards (e.g. back to a shared /add?url=… link); only a
  // same-site path is accepted.
  const next = safeNextPath(Array.isArray(searchParams.next) ? searchParams.next[0] : searchParams.next);
  // Already signed in? Skip the form.
  if (await getCurrentUser()) {
    redirect(next ?? '/dashboard');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <AuthForm mode="login" next={next} />
      <p className="text-sm text-muted-foreground">
        New here?{' '}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : '/register'} className="font-medium text-foreground underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </main>
  );
}
