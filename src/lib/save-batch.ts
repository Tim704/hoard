// ───────────────────────────────────────────────────────────────────────────
//  Batches quick changes into one save per key (the instant layout / title
//  view switch, src/components/prefs-provider.tsx). Each change shows at
//  once; the save waits until the key has been still for `delay` ms, so
//  arrowing through the layout thumbnails saves (and revalidates the app)
//  once, with the last value. A burst remembers the value from before its
//  first change, which is what Undo puts back. Framework-free, so it is
//  tested with fake timers.
// ───────────────────────────────────────────────────────────────────────────

/** One burst of changes to a key: its last value and the value before it. */
export interface Burst<V> {
  value: V;
  before: V;
}

export interface SaveBatcher<K extends string, V> {
  /**
   * `key` changed from `from` to `value`. Starts a burst (true) or extends
   * the open one (false), and (re)starts its timer.
   */
  push(key: K, from: V, value: V): boolean;
  /** A burst for `key` is waiting for its timer. */
  isScheduled(key: K): boolean;
  /** Saves every waiting burst now (leaving the page, unmounting). */
  flushAll(): void;
}

export function createSaveBatcher<K extends string, V>({
  delay,
  flush,
}: {
  delay: number;
  /** Called once per burst, `delay` ms after its last change (or on flushAll). */
  flush: (key: K, burst: Burst<V>) => void;
}): SaveBatcher<K, V> {
  const open = new Map<K, Burst<V> & { timer: ReturnType<typeof setTimeout> }>();

  function fire(key: K) {
    const burst = open.get(key);
    if (!burst) return;
    clearTimeout(burst.timer);
    open.delete(key);
    flush(key, { value: burst.value, before: burst.before });
  }

  return {
    push(key, from, value) {
      const current = open.get(key);
      if (current) clearTimeout(current.timer);
      open.set(key, {
        value,
        before: current ? current.before : from,
        timer: setTimeout(() => fire(key), delay),
      });
      return !current;
    },
    isScheduled: (key) => open.has(key),
    flushAll() {
      for (const key of [...open.keys()]) fire(key);
    },
  };
}
