import { getMarkdownEntries } from '@/lib/data-export';
import { exportResponse } from '@/lib/export-response';
import { markdownFiles, markdownZip } from '@/lib/markdown-export';

export const dynamic = 'force-dynamic';

/** Settings → Data: one Markdown note per title, zipped for Obsidian (spec 8.4). */
export function GET() {
  return exportResponse('markdown', 'zip', async (userId, timeZone, prefs) =>
    markdownZip(markdownFiles(await getMarkdownEntries(userId, timeZone, prefs.titleLanguage))),
  );
}
