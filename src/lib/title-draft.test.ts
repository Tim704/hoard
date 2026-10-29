import { describe, expect, it } from 'vitest';

import { makeActivity } from './test-fixtures';
import {
  NEW_FRANCHISE,
  NO_FRANCHISE,
  TITLE_DRAFT_PREFIX,
  changedFields,
  clearDraftKeys,
  followServer,
  isDirty,
  applyDraft,
  mergeDraft,
  parseDraft,
  parseValues,
  pruneDraft,
  valuesKey,
  valuesOf,
  type TitleValues,
} from './title-draft';

const base: TitleValues = { status: 'CONSUMING', rating: 7, favorite: false, notes: 'ok', franchiseId: NO_FRANCHISE };

describe('valuesOf', () => {
  it('reads what Save writes, null notes as empty and no franchise as NO_FRANCHISE', () => {
    expect(valuesOf(makeActivity({ id: 'a', status: 'PLANNED', notes: null }))).toEqual({
      status: 'PLANNED',
      rating: null,
      favorite: false,
      notes: '',
      franchiseId: NO_FRANCHISE,
    });
    const f = makeActivity({ id: 'b', rating: 8.5, favorite: true, notes: 'n', franchise: { id: 'fr1', name: 'Alien', imageUrl: null, rating: null } });
    expect(valuesOf(f)).toMatchObject({ rating: 8.5, favorite: true, notes: 'n', franchiseId: 'fr1' });
  });
});

describe('changedFields / isDirty', () => {
  it('is clean when nothing differs', () => {
    expect(changedFields(base, { ...base })).toEqual([]);
    expect(isDirty(base, { ...base })).toBe(false);
  });
  it('names every edited field, in a fixed order', () => {
    const local = { ...base, notes: 'new', status: 'COMPLETED' as const, franchiseId: NEW_FRANCHISE };
    expect(changedFields(local, base)).toEqual(['status', 'notes', 'franchiseId']);
    expect(isDirty(local, base)).toBe(true);
  });
  it('treats a cleared score as an edit', () => {
    expect(changedFields({ ...base, rating: null }, base)).toEqual(['rating']);
  });
});

describe('followServer', () => {
  it('moves untouched fields to the server value', () => {
    const server = { ...base, status: 'COMPLETED' as const, rating: 9 };
    const next = followServer(base, base, server);
    expect(next.local).toEqual(server);
    expect(next.base).toEqual(server);
    expect(isDirty(next.local, next.base)).toBe(false);
  });
  it('keeps an edit, measured against the new server value', () => {
    const local = { ...base, notes: 'my draft' };
    const server = { ...base, status: 'COMPLETED' as const };
    const next = followServer(local, base, server);
    expect(next.local).toEqual({ ...server, notes: 'my draft' });
    expect(changedFields(next.local, next.base)).toEqual(['notes']);
  });
  it('an edit the server now agrees with stops being dirty', () => {
    const local = { ...base, favorite: true };
    const next = followServer(local, base, { ...base, favorite: true });
    expect(isDirty(next.local, next.base)).toBe(false);
  });
  it('a new franchise saved as NEW_FRANCHISE takes the created id', () => {
    const saved = { ...base, franchiseId: NEW_FRANCHISE };
    const next = followServer(saved, saved, { ...base, franchiseId: 'fr-new' });
    expect(next.local.franchiseId).toBe('fr-new');
    expect(isDirty(next.local, next.base)).toBe(false);
  });
});

describe('valuesKey', () => {
  it('changes with any value and ignores key order', () => {
    expect(valuesKey(base)).toBe(valuesKey({ franchiseId: NO_FRANCHISE, notes: 'ok', favorite: false, rating: 7, status: 'CONSUMING' }));
    expect(valuesKey(base)).not.toBe(valuesKey({ ...base, rating: 7.5 }));
  });
});

describe('parseValues', () => {
  it('reads complete values', () => {
    expect(parseValues(base)).toEqual(base);
    expect(parseValues({ ...base, rating: null })).toEqual({ ...base, rating: null });
  });
  it('ignores anything malformed or incomplete', () => {
    expect(parseValues(null)).toBeNull();
    expect(parseValues('text')).toBeNull();
    expect(parseValues({ ...base, status: 'WATCHING' })).toBeNull();
    expect(parseValues({ ...base, rating: '7' })).toBeNull();
    expect(parseValues({ ...base, rating: Number.NaN })).toBeNull();
    expect(parseValues({ ...base, favorite: 'yes' })).toBeNull();
    expect(parseValues({ ...base, notes: undefined })).toBeNull();
    expect(parseValues({ ...base, franchiseId: '' })).toBeNull();
  });
  it('drops unknown keys', () => {
    expect(parseValues({ ...base, extra: 1 })).toEqual(base);
  });
});

describe('parseDraft', () => {
  const draft = { local: { ...base, notes: 'edited' }, base };
  it('reads a stored draft (object or JSON)', () => {
    expect(parseDraft(draft)).toEqual(draft);
    expect(parseDraft(JSON.stringify(draft))).toEqual(draft);
  });
  it('needs both halves valid', () => {
    expect(parseDraft('not json')).toBeNull();
    expect(parseDraft({ local: draft.local })).toBeNull();
    expect(parseDraft({ local: draft.local, base: { ...base, status: 'nope' } })).toBeNull();
    expect(parseDraft(base)).toBeNull();
  });
});

describe('applyDraft', () => {
  it('re-applies only the edited fields onto the server’s current values', () => {
    // Left with a notes edit; meanwhile the title was finished elsewhere.
    const draft = { local: { ...base, notes: 'edited' }, base };
    const server = { ...base, status: 'COMPLETED' as const, rating: 9 };
    expect(applyDraft(server, draft)).toEqual({ ...server, notes: 'edited' });
  });
  it('drops an edit to a field the server changed since, keeping the other edits', () => {
    // Notes and the score edited on the page and left unsaved; the notes were
    // then saved from the popup. The stale notes must not come back as an
    // unsaved edit (a later Save would overwrite the newer notes).
    const draft = { local: { ...base, notes: 'from the page', rating: 9 }, base };
    const server = { ...base, notes: 'saved in popup' };
    expect(applyDraft(server, draft)).toEqual({ ...server, rating: 9 });
    expect(changedFields(applyDraft(server, draft), server)).toEqual(['rating']);
  });
  it('keeps an edit whose field the server still holds as it was, drops the moved ones', () => {
    const draft = { local: { ...base, status: 'COMPLETED' as const, favorite: true }, base };
    const server = { ...base, status: 'DROPPED' as const, favorite: false, notes: 'x' };
    // favorite: the server still holds the draft's base (false), so that edit stays.
    expect(applyDraft(server, draft)).toEqual({ ...server, favorite: true });
    const moved = { ...server, favorite: true };
    expect(applyDraft(moved, draft)).toEqual(moved);
  });
  it('a draft without edits shows the server as it is', () => {
    const server = { ...base, favorite: true };
    expect(applyDraft(server, { local: base, base })).toEqual(server);
  });
});

describe('pruneDraft', () => {
  it('drops only the written fields, keeping the other edits', () => {
    // The page left a franchise pick and a notes edit; the popup then saved Favorite.
    const draft = { local: { ...base, notes: 'page notes', franchiseId: 'fr1' }, base };
    expect(pruneDraft(draft, ['favorite'])).toEqual(draft);
    // The popup saved the notes too: only the franchise pick stays.
    expect(pruneDraft(draft, ['favorite', 'notes'])).toEqual({ local: { ...base, franchiseId: 'fr1' }, base });
  });
  it('is null once no edits remain', () => {
    const draft = { local: { ...base, notes: 'page notes' }, base };
    expect(pruneDraft(draft, ['notes', 'status'])).toBeNull();
    expect(pruneDraft({ local: base, base }, [])).toBeNull();
  });
  it('a franchise move that failed was not written, so its edit stays', () => {
    const draft = { local: { ...base, franchiseId: 'fr1', rating: 9 }, base };
    // The save wrote the score; the franchise move failed (not in `written`).
    expect(pruneDraft(draft, ['rating'])).toEqual({ local: { ...base, franchiseId: 'fr1' }, base });
  });
  it('leaves the stored draft as it was', () => {
    const draft = { local: { ...base, notes: 'x' }, base };
    pruneDraft(draft, ['notes']);
    expect(draft.local.notes).toBe('x');
  });
});

describe('mergeDraft', () => {
  it('is the incoming draft when nothing is stored', () => {
    const incoming = { local: { ...base, favorite: true }, base };
    expect(mergeDraft(null, incoming)).toEqual(incoming);
  });
  it('keeps the stored edits the incoming draft doesn’t touch', () => {
    // The page had a franchise pick; the popup hands over a favourite.
    const stored = { local: { ...base, franchiseId: 'fr1' }, base };
    const incoming = { local: { ...base, favorite: true }, base };
    const merged = mergeDraft(stored, incoming);
    expect(merged.local).toEqual({ ...base, franchiseId: 'fr1', favorite: true });
    expect(changedFields(merged.local, merged.base)).toEqual(['favorite', 'franchiseId']);
  });
  it('the incoming edit wins a field both edited', () => {
    const stored = { local: { ...base, notes: 'from the page', rating: 5 }, base };
    const incoming = { local: { ...base, notes: 'from the popup' }, base };
    expect(mergeDraft(stored, incoming).local).toEqual({ ...base, notes: 'from the popup', rating: 5 });
  });
  it('keeps each kept edit against the value it was made against', () => {
    // The page's notes edit was made against 'ok'; the popup now sees the
    // server's newer status. A later applyDraft still checks each field
    // against its own base.
    const stored = { local: { ...base, notes: 'from the page' }, base };
    const newer = { ...base, status: 'COMPLETED' as const };
    const incoming = { local: { ...newer, favorite: true }, base: newer };
    const merged = mergeDraft(stored, incoming);
    expect(merged.base).toEqual(newer);
    expect(merged.local).toEqual({ ...newer, favorite: true, notes: 'from the page' });
    expect(applyDraft(newer, merged)).toEqual({ ...newer, favorite: true, notes: 'from the page' });
  });
});

describe('clearDraftKeys', () => {
  /** A Storage-like Map whose keys renumber on removal, as sessionStorage's do. */
  const fakeStorage = (entries: Record<string, string>) => {
    const map = new Map(Object.entries(entries));
    return {
      map,
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      removeItem: (k: string) => void map.delete(k),
    };
  };

  it('removes every title draft and nothing else', () => {
    const storage = fakeStorage({
      [`${TITLE_DRAFT_PREFIX}a`]: '{}',
      'hoard:books:view': '"grid"',
      [`${TITLE_DRAFT_PREFIX}b`]: '{}',
      [`${TITLE_DRAFT_PREFIX}c`]: '{}',
      'hoard:title-draft': 'no colon: not a draft',
      'other:hoard:title-draft:x': 'prefix not at the start',
    });
    clearDraftKeys(storage);
    expect([...storage.map.keys()]).toEqual(['hoard:books:view', 'hoard:title-draft', 'other:hoard:title-draft:x']);
  });

  it('is a no-op on storage without drafts', () => {
    const storage = fakeStorage({ 'hoard:theme': 'dark' });
    clearDraftKeys(storage);
    expect([...storage.map.keys()]).toEqual(['hoard:theme']);
    clearDraftKeys(fakeStorage({}));
  });
});
