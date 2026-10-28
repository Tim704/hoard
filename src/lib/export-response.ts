// Shared plumbing for the /api/export/* route handlers (spec 1.11): a session
// is required (401 otherwise), and files download with a dated name.
// Server-only.

import { getPrefs } from '@/lib/data-prefs';
import { exportFilename } from '@/lib/export';
import { effectiveTimeZone } from '@/lib/prefs';
import { getCurrentUser } from '@/lib/session';

export async function exportResponse(
  name: string,
  ext: 'csv' | 'json',
  build: (userId: string, timeZone: string) => Promise<string>,
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response('Not signed in.', { status: 401 });
  try {
    const timeZone = effectiveTimeZone(await getPrefs(user.id));
    const body = await build(user.id, timeZone);
    return new Response(body, {
      headers: {
        'Content-Type': ext === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFilename(name, ext, timeZone)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error(`[export] ${name} failed:`, err);
    return new Response('Export failed.', { status: 500 });
  }
}
