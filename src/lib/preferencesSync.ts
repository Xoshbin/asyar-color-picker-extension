/** Narrow view-context slice this helper needs — keeps it testable without the full SDK context. */
export interface PreferencesSyncContext {
  request<T = unknown>(id: string, payload?: unknown): Promise<T>;
  onPreferencesChanged(callback: () => void): () => void;
}

/**
 * The launcher only ever live-pushes preference changes to the view iframe,
 * never the always-on worker, so nothing re-runs `preferences.refresh()`
 * there after boot. Ping the worker's `refresh-preferences` RPC on mount and
 * on every subsequent change so its tray state stays reconciled.
 */
export function syncWorkerPreferences(context: PreferencesSyncContext): () => void {
  const ping = () => {
    void context.request('refresh-preferences', {}).catch(() => {
      // Worker unreachable — next mount or change will retry.
    });
  };
  ping();
  return context.onPreferencesChanged(ping);
}
