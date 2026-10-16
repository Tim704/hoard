import './globals.css';

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

// Inter as the app's sans typeface; exposed as a CSS variable so Tailwind's
// `font-sans` (configured to fall back to system fonts) picks it up.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Hoard — Media Tracker',
  description:
    'Hoard everything you mean to watch, read, play and listen to — across seven domains.',
};

// `viewport-fit=cover` lets the mobile chrome (top bar, drawer, bottom sheets)
// extend behind notches; those surfaces pad with env(safe-area-inset-*).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          No-FOUC theme bootstrap: runs before paint to apply the saved theme
          (or the OS preference when unset), so there's no light→dark flash.
          Must stay in sync with ThemeToggle's `hoard-theme` localStorage key.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('hoard-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();",
          }}
        />
      </head>
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          inter.variable,
        )}
      >
        {children}
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
