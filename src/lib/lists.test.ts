import { describe, expect, it } from 'vitest';

import {
  canEditList,
  canManageList,
  canViewList,
  isPermutation,
  listRole,
  nextListPosition,
  parseListInput,
} from './lists';

const list = {
  ownerId: 'owner',
  members: [
    { userId: 'ed', canEdit: true },
    { userId: 'view', canEdit: false },
  ],
};

describe('list permissions', () => {
  it('gives each user their role', () => {
    expect(listRole(list, 'owner')).toBe('owner');
    expect(listRole(list, 'ed')).toBe('editor');
    expect(listRole(list, 'view')).toBe('viewer');
    expect(listRole(list, 'stranger')).toBeNull();
    expect(listRole(null, 'owner')).toBeNull();
    expect(listRole(list, null)).toBeNull();
    expect(listRole(list, '')).toBeNull();
  });
  it('canViewList: owner and every member, nobody else', () => {
    expect(canViewList(list, 'owner')).toBe(true);
    expect(canViewList(list, 'ed')).toBe(true);
    expect(canViewList(list, 'view')).toBe(true);
    expect(canViewList(list, 'stranger')).toBe(false);
    expect(canViewList(undefined, 'owner')).toBe(false);
  });
  it('canEditList: owner and editors only', () => {
    expect(canEditList(list, 'owner')).toBe(true);
    expect(canEditList(list, 'ed')).toBe(true);
    expect(canEditList(list, 'view')).toBe(false);
    expect(canEditList(list, 'stranger')).toBe(false);
    expect(canEditList(null, 'ed')).toBe(false);
  });
  it('canManageList: the owner only', () => {
    expect(canManageList(list, 'owner')).toBe(true);
    expect(canManageList(list, 'ed')).toBe(false);
    expect(canManageList(list, 'view')).toBe(false);
  });
});

describe('parseListInput', () => {
  it('trims and collapses the name, empties the description to null', () => {
    expect(parseListInput('  Comfort   watches ', '  ')).toEqual({ ok: true, name: 'Comfort watches', description: null });
  });
  it('enforces the limits', () => {
    expect(parseListInput('', null).ok).toBe(false);
    expect(parseListInput('x'.repeat(81), null).ok).toBe(false);
    expect(parseListInput('x'.repeat(80), 'y'.repeat(500)).ok).toBe(true);
    expect(parseListInput('ok', 'y'.repeat(501)).ok).toBe(false);
    expect(parseListInput(42, null).ok).toBe(false);
    expect(parseListInput('ok', 42).ok).toBe(false);
  });
});

describe('positions and reorders', () => {
  it('appends after the largest position', () => {
    expect(nextListPosition(null)).toBe(1000);
    expect(nextListPosition(3000)).toBe(4000);
  });
  it('accepts only an exact permutation', () => {
    expect(isPermutation(['b', 'a'], ['a', 'b'])).toBe(true);
    expect(isPermutation(['a'], ['a', 'b'])).toBe(false);
    expect(isPermutation(['a', 'a'], ['a', 'b'])).toBe(false);
    expect(isPermutation(['a', 'c'], ['a', 'b'])).toBe(false);
    expect(isPermutation(['a', 1], ['a', 'b'])).toBe(false);
  });
});
