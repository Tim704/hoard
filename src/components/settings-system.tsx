// ───────────────────────────────────────────────────────────────────────────
//  Settings → System (server component): the backup status and each scheduled
//  job's last run. Only rendered for the owner (it shows pg_dump and job
//  errors). Times are shown in the viewer's effective time zone.
// ───────────────────────────────────────────────────────────────────────────

import { AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backupProblem, type BackupStatus } from '@/lib/backups';
import type { JobRunInfo } from '@/lib/data-system';

function formatWhen(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const formatDuration = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

export function SettingsSystem({
  backup,
  jobs,
  timeZone,
  now,
}: {
  backup: BackupStatus;
  jobs: JobRunInfo[];
  timeZone: string;
  now: Date;
}) {
  const problem = backup.mounted ? backupProblem(backup, now) : null;

  return (
    <Card id="system" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-base">System</CardTitle>
        <CardDescription>Backups and scheduled jobs for this Hoard server.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1 text-sm">
          <p className="font-medium">Backups</p>
          {!backup.mounted ? (
            <p className="flex items-start gap-2 text-muted-foreground">
              <CircleDashed className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              No backup folder is mounted on this server.
            </p>
          ) : (
            <p className={problem ? 'flex items-start gap-2 text-destructive' : 'flex items-start gap-2'}>
              {problem ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              )}
              <span>
                {backup.lastSuccess
                  ? `Last backup ${formatWhen(backup.lastSuccess, timeZone)}${
                      backup.bytes ? ` · ${formatBytes(backup.bytes)}` : ''
                    }.`
                  : 'No backup yet.'}
                {problem && backup.lastSuccess ? ` ${problem}` : ''}
                {!backup.lastSuccess && backup.lastError ? ` Last error: ${backup.lastError}` : ''}
              </span>
            </p>
          )}
          {backup.mounted && backup.lastError && backup.lastSuccess && !problem && (
            <p className="text-xs text-muted-foreground">Last attempt failed: {backup.lastError}</p>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <p className="font-medium">Scheduled jobs</p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {jobs.map((j) => (
              <li key={j.name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2">
                <span className="font-mono text-xs">
                  {j.name} <span className="text-muted-foreground">({j.schedule})</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {j.lastStatus === 'seeded' ? (
                    'Waiting for its first run'
                  ) : j.lastRunAt ? (
                    <>
                      <span className={j.lastStatus === 'error' ? 'text-destructive' : undefined}>
                        {j.lastStatus === 'ok' ? 'OK' : j.lastStatus}
                      </span>
                      {' · '}
                      {formatWhen(j.lastRunAt, timeZone)}
                      {j.lastDurationMs !== null ? ` · ${formatDuration(j.lastDurationMs)}` : ''}
                    </>
                  ) : (
                    'Never ran'
                  )}
                </span>
                {j.lastError && (
                  <span className="w-full break-words text-xs text-destructive">{j.lastError}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
