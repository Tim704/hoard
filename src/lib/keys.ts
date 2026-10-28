// ───────────────────────────────────────────────────────────────────────────
//  Global keyboard shortcuts (spec 2.5 / 2.6). Pure and client-safe: the
//  checks take plain objects, so they are tested without a DOM.
// ───────────────────────────────────────────────────────────────────────────

interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

/** True while the user is typing (input, textarea, select, contenteditable, a textbox role). */
export function isTypingTarget(target: TargetLike | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  const role = target.getAttribute?.('role');
  return role === 'textbox' || role === 'combobox' || role === 'searchbox';
}

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
  target?: TargetLike | null;
}

/** Apple platforms use Cmd for shortcuts (Ctrl+K is a text-editing key there). */
export function isApplePlatform(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

/**
 * Which global shortcut a key press is: the palette (Cmd+K on Apple
 * platforms, Ctrl+K elsewhere — never the other one, so macOS keeps Ctrl+K
 * "delete to end of line" in text fields), `/` (search) or none.
 */
export function globalShortcut(e: KeyLike, apple = false): 'palette' | 'search' | null {
  const mod = apple ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (mod && !e.altKey && e.key.toLowerCase() === 'k') return 'palette';
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) return 'search';
  return null;
}
