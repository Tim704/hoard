import { describe, expect, it } from 'vitest';

import { globalShortcut, isTypingTarget } from './keys';

const el = (tagName: string, extra: { isContentEditable?: boolean; role?: string } = {}) => ({
  tagName,
  isContentEditable: extra.isContentEditable ?? false,
  getAttribute: (n: string) => (n === 'role' ? extra.role ?? null : null),
});
const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}, target: unknown = el('BODY')) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
  target: target as ReturnType<typeof el>,
});

describe('isTypingTarget', () => {
  it('spots inputs, textareas, selects, contenteditable and textbox roles', () => {
    expect(isTypingTarget(el('INPUT'))).toBe(true);
    expect(isTypingTarget(el('textarea'))).toBe(true);
    expect(isTypingTarget(el('SELECT'))).toBe(true);
    expect(isTypingTarget(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(isTypingTarget(el('DIV', { role: 'textbox' }))).toBe(true);
    expect(isTypingTarget(el('BUTTON'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('globalShortcut', () => {
  it('opens the palette on Cmd+K and Ctrl+K, even while typing', () => {
    expect(globalShortcut(key('k', { metaKey: true }))).toBe('palette');
    expect(globalShortcut(key('K', { ctrlKey: true }, el('INPUT')))).toBe('palette');
    expect(globalShortcut(key('k'))).toBeNull();
  });

  it('opens search on `/` unless typing or modified', () => {
    expect(globalShortcut(key('/'))).toBe('search');
    expect(globalShortcut(key('/', {}, el('INPUT')))).toBeNull();
    expect(globalShortcut(key('/', {}, el('DIV', { isContentEditable: true })))).toBeNull();
    expect(globalShortcut(key('/', { ctrlKey: true }))).toBeNull();
  });
});
