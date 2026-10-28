// A small bounded map that forgets the least recently used key first (for
// in-process caches that must not grow without limit). Pure.

export class LruMap<K, V> {
  private map = new Map<K, V>();

  constructor(private readonly max: number) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    // Re-insert so the key becomes the most recently used.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as K);
  }

  get size(): number {
    return this.map.size;
  }
}
