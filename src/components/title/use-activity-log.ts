'use client';

import { useCallback, useEffect, useState } from 'react';

import { settle } from '@/lib/action-result';
import { getActivityLog, type ActivityLog } from '@/lib/actions/diary';

/**
 * A title's log (diary entries, events, play sessions), loaded once per
 * title; `reload` fetches it again after a change.
 */
export function useActivityLog(activityId: string): {
  log: ActivityLog | null;
  failed: boolean;
  reload: () => Promise<void>;
} {
  const [log, setLog] = useState<ActivityLog | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const res = await settle(getActivityLog(activityId));
    if (res.ok && res.log) {
      setLog(res.log);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, [activityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { log, failed, reload };
}
