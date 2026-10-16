import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { AuthForm } from '@/components/auth-form';

export default async function LoginPage() {
  // Already signed in? Skip the form.
  if (await getCurrentUser()) {
    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <AuthForm mode="login" />
      <p className="text-sm text-muted-foreground">
        New here?{' '}
        <Link href="/register" className="font-medium text-foreground underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </main>
  );
}
