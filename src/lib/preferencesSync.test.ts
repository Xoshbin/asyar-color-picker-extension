import { describe, it, expect, vi } from 'vitest';
import { syncWorkerPreferences } from './preferencesSync';

function makeContext() {
  const listeners: Array<() => void> = [];
  return {
    request: vi.fn(async () => undefined),
    onPreferencesChanged: vi.fn((cb: () => void) => {
      listeners.push(cb);
      return () => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    }),
    _fire: () => listeners.forEach((l) => l()),
  };
}

describe('syncWorkerPreferences', () => {
  it('pings the worker to reconcile immediately on mount', () => {
    const ctx = makeContext();
    syncWorkerPreferences(ctx as any);
    expect(ctx.request).toHaveBeenCalledWith('refresh-preferences', {});
  });

  it('pings again whenever preferences change while the view is mounted', () => {
    const ctx = makeContext();
    syncWorkerPreferences(ctx as any);
    ctx.request.mockClear();
    ctx._fire();
    expect(ctx.request).toHaveBeenCalledTimes(1);
    expect(ctx.request).toHaveBeenCalledWith('refresh-preferences', {});
  });

  it('returns an unsubscribe that stops future pings (call from onDestroy)', () => {
    const ctx = makeContext();
    const unsync = syncWorkerPreferences(ctx as any);
    unsync();
    ctx.request.mockClear();
    ctx._fire();
    expect(ctx.request).not.toHaveBeenCalled();
  });

  it('swallows a rejected ping instead of throwing an unhandled rejection', () => {
    const ctx = makeContext();
    ctx.request.mockRejectedValueOnce(new Error('worker unreachable'));
    expect(() => syncWorkerPreferences(ctx as any)).not.toThrow();
  });
});
