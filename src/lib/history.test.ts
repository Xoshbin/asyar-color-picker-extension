import { describe, it, expect } from 'vitest';
import {
  loadHistory,
  prependHistory,
  toggleFavorite,
  deleteHistoryEntry,
  clearHistory,
  filterHistory,
  resolveFocusedEntry,
} from './history';
import type { HistoryEntry } from './types';

interface FakeStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<boolean>;
  getAll(): Promise<Record<string, string>>;
  clear(): Promise<number>;
}

function fakeStorage(): FakeStorage & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    async get(k) {
      return store.has(k) ? store.get(k)! : null;
    },
    async set(k, v) {
      store.set(k, v);
    },
    async delete(k) {
      return store.delete(k);
    },
    async getAll() {
      return Object.fromEntries(store);
    },
    async clear() {
      const n = store.size;
      store.clear();
      return n;
    },
  };
}

function entry(id: string, ts: number, hex = '#ff0000'): HistoryEntry {
  return { id, hex, r: 255, g: 0, b: 0, timestamp: ts, favorite: false };
}

describe('loadHistory', () => {
  it('returns an empty array when nothing is persisted', async () => {
    const s = fakeStorage();
    expect(await loadHistory(s as any)).toEqual([]);
  });

  it('parses the persisted JSON array', async () => {
    const s = fakeStorage();
    s._store.set('history', JSON.stringify([entry('a', 1)]));
    expect(await loadHistory(s as any)).toEqual([entry('a', 1)]);
  });

  it('returns an empty array on corrupt JSON instead of throwing', async () => {
    const s = fakeStorage();
    s._store.set('history', 'not-json');
    expect(await loadHistory(s as any)).toEqual([]);
  });
});

describe('prependHistory', () => {
  it('adds a new entry to the front (most recent first)', async () => {
    const s = fakeStorage();
    await prependHistory(s as any, entry('a', 1), 10);
    await prependHistory(s as any, entry('b', 2), 10);
    const arr = await loadHistory(s as any);
    expect(arr.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('evicts the oldest (last) entries when the cap is exceeded', async () => {
    const s = fakeStorage();
    for (let i = 0; i < 5; i++) await prependHistory(s as any, entry(`e${i}`, i), 3);
    const arr = await loadHistory(s as any);
    expect(arr.map((e) => e.id)).toEqual(['e4', 'e3', 'e2']);
  });

  it('never evicts favorited entries even past the cap', async () => {
    const s = fakeStorage();
    await prependHistory(s as any, { ...entry('fav', 0), favorite: true }, 2);
    await prependHistory(s as any, entry('b', 1), 2);
    await prependHistory(s as any, entry('c', 2), 2);
    const arr = await loadHistory(s as any);
    expect(arr.map((e) => e.id)).toContain('fav');
  });

  it('honors a cap of 0 by storing nothing beyond favorites', async () => {
    const s = fakeStorage();
    await prependHistory(s as any, entry('a', 1), 0);
    expect(await loadHistory(s as any)).toEqual([]);
  });
});

describe('toggleFavorite', () => {
  it('flips the favorite flag for the matching id', async () => {
    const s = fakeStorage();
    s._store.set('history', JSON.stringify([entry('a', 1), entry('b', 2)]));
    await toggleFavorite(s as any, 'a');
    const arr = await loadHistory(s as any);
    expect(arr.find((e) => e.id === 'a')?.favorite).toBe(true);
    expect(arr.find((e) => e.id === 'b')?.favorite).toBe(false);
  });

  it('is a no-op when the id does not exist', async () => {
    const s = fakeStorage();
    s._store.set('history', JSON.stringify([entry('a', 1)]));
    await toggleFavorite(s as any, 'missing');
    expect((await loadHistory(s as any)).map((e) => e.favorite)).toEqual([false]);
  });
});

describe('deleteHistoryEntry', () => {
  it('removes the matching id, preserves the rest', async () => {
    const s = fakeStorage();
    s._store.set('history', JSON.stringify([entry('a', 1), entry('b', 2), entry('c', 3)]));
    await deleteHistoryEntry(s as any, 'b');
    expect((await loadHistory(s as any)).map((e) => e.id)).toEqual(['a', 'c']);
  });
});

describe('clearHistory', () => {
  it('deletes everything except favorited entries', async () => {
    const s = fakeStorage();
    s._store.set(
      'history',
      JSON.stringify([{ ...entry('fav', 1), favorite: true }, entry('b', 2)]),
    );
    await clearHistory(s as any);
    const arr = await loadHistory(s as any);
    expect(arr.map((e) => e.id)).toEqual(['fav']);
  });
});

describe('filterHistory', () => {
  const entries = [entry('a', 1, '#ff0000'), entry('b', 2, '#00ff00'), entry('c', 3, '#0000ff')];

  it('returns everything when the query is blank', () => {
    expect(filterHistory(entries, '')).toEqual(entries);
  });

  it('matches by hex substring, case-insensitively', () => {
    expect(filterHistory(entries, 'FF0000').map((e) => e.id)).toEqual(['a']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterHistory(entries, 'zzz')).toEqual([]);
  });
});

describe('resolveFocusedEntry', () => {
  const entries = [entry('a', 1), entry('b', 2)];

  it('returns the entry matching focusedId when present in the list', () => {
    expect(resolveFocusedEntry(entries, 'a')).toEqual(entry('a', 1));
  });

  it('returns null when focusedId is null', () => {
    expect(resolveFocusedEntry(entries, null)).toBeNull();
  });

  it('returns null when focusedId is not in the given (e.g. filtered) list', () => {
    // Reproduces the data-loss bug: an entry focused before filtering is no
    // longer present in the currently-visible `filtered` list.
    expect(resolveFocusedEntry([entry('b', 2)], 'a')).toBeNull();
  });
});
