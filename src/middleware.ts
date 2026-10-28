import { NextResponse, type NextRequest } from 'next/server';

// Hands the requested path + query to server components (the (app) layout
// reads it), so a signed-out visit to e.g. /add?url=… goes to
// /login?next=/add?url=… and comes back after signing in. Any incoming
// header of the same name is overwritten.
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set('x-hoard-path', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Pages only: not Next's assets, route handlers or static files.
  matcher: ['/((?!_next/|api/|.*\\.(?:png|svg|jpg|jpeg|ico|webmanifest|txt|xml)$).*)'],
};
