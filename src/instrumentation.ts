// Next.js calls `register` once per server process. The job scheduler (spec G9)
// starts here, only in the Node.js runtime, never during `next build`, and not
// at all with HOARD_SCHEDULER=off. The dynamic import sits directly inside the
// NEXT_RUNTIME check so the Edge bundle drops it.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.NEXT_PHASE === 'phase-production-build') return;
    if (process.env.HOARD_SCHEDULER === 'off') return;
    const { startScheduler } = await import('./lib/jobs');
    startScheduler();
  }
}
