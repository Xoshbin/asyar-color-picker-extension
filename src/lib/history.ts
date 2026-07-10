import type { IStorageService } from 'asyar-sdk/contracts';
import type { HistoryEntry } from './types';

const KEY = 'history';

export async function loadHistory(storage: IStorageService): Promise<HistoryEntry[]> {
  const raw = await storage.get(KEY);
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

async function save(storage: IStorageService, entries: HistoryEntry[]): Promise<void> {
  await storage.set(KEY, JSON.stringify(entries));
}

/**
 * Add the most recent pick to the front. Eviction only removes non-favorited
 * entries past `cap`, so a user's starred colors are never silently dropped.
 */
export async function prependHistory(
  storage: IStorageService,
  entry: HistoryEntry,
  cap: number,
): Promise<void> {
  const existing = await loadHistory(storage);
  const next = [entry, ...existing];
  const rest = next.filter((e) => !e.favorite);
  const trimmedRest = cap > 0 ? rest.slice(0, cap) : [];
  const keptIds = new Set(trimmedRest.map((e) => e.id));
  // Preserve overall recency order rather than favorites-first.
  const merged = next.filter((e) => e.favorite || keptIds.has(e.id));
  await save(storage, merged);
}

export async function toggleFavorite(storage: IStorageService, id: string): Promise<void> {
  const entries = await loadHistory(storage);
  const next = entries.map((e) => (e.id === id ? { ...e, favorite: !e.favorite } : e));
  await save(storage, next);
}

export async function deleteHistoryEntry(storage: IStorageService, id: string): Promise<void> {
  const entries = await loadHistory(storage);
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return;
  await save(storage, next);
}

/** Clears all history except favorited entries. */
export async function clearHistory(storage: IStorageService): Promise<void> {
  const entries = await loadHistory(storage);
  const kept = entries.filter((e) => e.favorite);
  await save(storage, kept);
}

/** Case-insensitive substring match against the hex string. */
export function filterHistory(entries: HistoryEntry[], query: string): HistoryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => e.hex.toLowerCase().includes(q));
}

/**
 * Resolves the focused entry against the currently-visible list only.
 * Returns null if focusedId is unset OR has been filtered out — callers
 * must not act on an entry that's no longer visible (data-loss guard).
 */
export function resolveFocusedEntry(
  entries: HistoryEntry[],
  focusedId: string | null,
): HistoryEntry | null {
  if (!focusedId) return null;
  return entries.find((e) => e.id === focusedId) ?? null;
}
