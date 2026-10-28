// Shared plumbing for the /api/export/* route handlers (spec 1.11): a session
// is required (401 otherwise), and files download with a dated name.
// Server-only.

import { getPrefs } from '@/lib/data-prefs';
import { exportFilename } from '@/lib/export';
import { effectiveTimeZone, type Prefs } from '@/lib/prefs';
import { getCurrentUser } from '@/lib/session';

const CONTENT_TYPE = {
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
  zip: 'application/zip',
} as const;

export async function exportResponse(
  name: string,
  ext: 'csv' | 'json' | 'zip',
  build: (userId: string, timeZone: string, prefs: Prefs) => Promise<string | Uint8Array>,
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response('Not signed in.', { status: 401 });
  try {
    const prefs = await getPrefs(user.id);
    const timeZone = effectiveTimeZone(prefs);
    const body = await build(user.id, timeZone, prefs);
    // A zip's bytes are a valid body; TS's DOM types only lack the generic form.
    return new Response(typeof body === 'string' ? body : (body as unknown as BodyInit), {
      headers: {
        'Content-Type': CONTENT_TYPE[ext],
        'Content-Disposition': `attachment; filename="${exportFilename(name, ext, timeZone)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error(`[export] ${name} failed:`, err);
    return new Response('Export failed.', { status: 500 });
  }
}
