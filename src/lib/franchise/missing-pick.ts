// The "Add missing titles" checklist's starting selection (spec 2.10). Its
// own module so the client component doesn't pull in the provider code.

/** Up to this many missing titles start ticked; a longer list starts empty. */
export const AUTO_TICK_MAX = 10;

/** The keys ticked when the list opens: all of a short list, none of a long one. */
export function initialTicked(keys: string[]): Set<string> {
  return new Set(keys.length <= AUTO_TICK_MAX ? keys : []);
}
