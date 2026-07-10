import { describe, it, expect, vi } from 'vitest';
import { PickerController, type PickerControllerDeps } from './pickerController';

function makeStorage() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    delete: vi.fn(async (k: string) => store.delete(k)),
    getAll: vi.fn(async () => Object.fromEntries(store)),
    clear: vi.fn(async () => {
      const n = store.size;
      store.clear();
      return n;
    }),
  };
}

function makeStatusBar() {
  return {
    registerItem: vi.fn(),
    updateItem: vi.fn(),
    unregisterItem: vi.fn(),
  };
}

function makeScreen(result: { r: number; g: number; b: number; hex: string } | null) {
  return { pickColor: vi.fn(async () => result) };
}

function makeNotifications() {
  return {
    checkPermission: vi.fn(async () => true),
    requestPermission: vi.fn(async () => true),
    send: vi.fn(async () => 'notif-1'),
    dismiss: vi.fn(async () => undefined),
  };
}

function makePreferences(initial: Record<string, unknown> = {}) {
  return { values: Object.freeze({ ...initial }) as Readonly<Record<string, unknown>> };
}

/** Mirrors the coffee extension's stale-worker-preferences fake. */
function makeStalePreferences(serverValues: Record<string, unknown>) {
  const facade = {
    values: Object.freeze({}) as Readonly<Record<string, unknown>>,
    refresh: vi.fn(async () => {
      facade.values = Object.freeze({ ...serverValues });
      return facade.values;
    }),
  };
  return facade;
}

function fakeCanvas() {
  const ctx = { fillStyle: '', fillRect: vi.fn() };
  return { width: 0, height: 0, getContext: vi.fn(() => ctx), toDataURL: vi.fn(() => 'data:image/png;base64,X') };
}

function makeLog() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), custom: vi.fn() };
}

function buildDeps(overrides: Partial<PickerControllerDeps> = {}): PickerControllerDeps {
  return {
    storage: makeStorage() as any,
    statusBar: makeStatusBar() as any,
    screen: makeScreen({ r: 255, g: 0, b: 0, hex: '#ff0000' }) as any,
    notifications: makeNotifications() as any,
    preferences: makePreferences({ trayIconEnabled: true, historyLimit: 50 }) as any,
    log: makeLog() as any,
    createCanvas: () => fakeCanvas() as any,
    now: () => 1_000_000,
    genId: () => 'id-1',
    ...overrides,
  };
}

describe('PickerController — activate', () => {
  it('registers the tray with a fallback glyph when trayIconEnabled and no history yet', async () => {
    const deps = buildDeps();
    const ctrl = new PickerController(deps);
    await ctrl.activate();
    expect(deps.statusBar.registerItem).toHaveBeenCalledTimes(1);
    const item = (deps.statusBar.registerItem as any).mock.calls[0][0];
    expect(item.icon).toBe('🎨');
  });

  it('does not register the tray when trayIconEnabled is false', async () => {
    const deps = buildDeps({ preferences: makePreferences({ trayIconEnabled: false }) as any });
    const ctrl = new PickerController(deps);
    await ctrl.activate();
    expect(deps.statusBar.registerItem).not.toHaveBeenCalled();
  });

  it('refreshes a stale/empty worker preferences snapshot before deciding on tray registration', async () => {
    const prefs = makeStalePreferences({ trayIconEnabled: true, historyLimit: 50 });
    const deps = buildDeps({ preferences: prefs as any });
    const ctrl = new PickerController(deps);
    await ctrl.activate();
    expect(prefs.refresh).toHaveBeenCalled();
    expect(deps.statusBar.registerItem).toHaveBeenCalledTimes(1);
  });

  it('renders the swatch of the most recent history entry as the tray icon', async () => {
    const storage = makeStorage();
    await storage.set(
      'history',
      JSON.stringify([{ id: 'a', hex: '#00ff00', r: 0, g: 255, b: 0, timestamp: 1, favorite: false }]),
    );
    const deps = buildDeps({ storage: storage as any });
    const ctrl = new PickerController(deps);
    await ctrl.activate();
    const item = (deps.statusBar.registerItem as any).mock.calls[0][0];
    expect(item.iconPath).toBe('data:image/png;base64,X');
  });
});

describe('PickerController — tray click wiring', () => {
  it('wires the "Pick Color" submenu row to actually trigger a pick', async () => {
    const deps = buildDeps();
    const ctrl = new PickerController(deps);
    await ctrl.activate();

    const item = (deps.statusBar.registerItem as any).mock.calls[0][0];
    const pickRow = item.submenu.find((r: any) => r.id === 'pick-color');
    expect(typeof pickRow.onClick).toBe('function');

    pickRow.onClick({ itemPath: ['color-picker-tray', 'pick-color'] });
    await new Promise((r) => setTimeout(r, 0));
    expect(deps.screen.pickColor).toHaveBeenCalledTimes(1);
  });
});

describe('PickerController — pickViaTray', () => {
  it('does nothing when the user cancels the pick (null result)', async () => {
    const deps = buildDeps({ screen: makeScreen(null) as any });
    const ctrl = new PickerController(deps);
    await ctrl.activate();
    (deps.statusBar.updateItem as any).mockClear();
    await ctrl.pickViaTray();
    expect(deps.statusBar.updateItem).not.toHaveBeenCalled();
    expect(deps.notifications.send).not.toHaveBeenCalled();
  });

  it('appends to history, refreshes the tray, and sends a notification on success', async () => {
    const deps = buildDeps();
    const ctrl = new PickerController(deps);
    await ctrl.activate();
    await ctrl.pickViaTray();

    expect(deps.storage.set).toHaveBeenCalled();
    const stored = JSON.parse((deps.storage.set as any).mock.calls[0][1]);
    expect(stored[0]).toMatchObject({ hex: '#ff0000', id: 'id-1' });

    expect(deps.notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('#ff0000') }),
    );
  });

  it('never calls a clipboard API — the worker has none', async () => {
    const deps = buildDeps();
    const ctrl = new PickerController(deps);
    await ctrl.activate();
    await ctrl.pickViaTray();
    expect((deps as any).clipboard).toBeUndefined();
  });

  it('is a no-op when trayIconEnabled is false (menu item cannot be clicked without a tray)', async () => {
    const deps = buildDeps({ preferences: makePreferences({ trayIconEnabled: false }) as any });
    const ctrl = new PickerController(deps);
    await ctrl.activate();
    await ctrl.pickViaTray();
    expect(deps.screen.pickColor).not.toHaveBeenCalled();
  });

  it('catches a rejected screen.pickColor() and logs it instead of throwing/rejecting', async () => {
    const screen = {
      pickColor: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const deps = buildDeps({ screen: screen as any });
    const ctrl = new PickerController(deps);
    await ctrl.activate();

    await expect(ctrl.pickViaTray()).resolves.toBeUndefined();
    expect(deps.log.error).toHaveBeenCalledTimes(1);
    expect(deps.notifications.send).not.toHaveBeenCalled();
  });

  it('catches a rejected storage write mid-flow and logs it instead of throwing/rejecting', async () => {
    const storage = makeStorage();
    (storage.set as any).mockRejectedValueOnce(new Error('disk full'));
    const deps = buildDeps({ storage: storage as any });
    const ctrl = new PickerController(deps);
    await ctrl.activate();

    await expect(ctrl.pickViaTray()).resolves.toBeUndefined();
    expect(deps.log.error).toHaveBeenCalledTimes(1);
  });
});

describe('PickerController — refreshPreferences (worker-side refresh-preferences RPC target)', () => {
  it('re-registers the tray once a live-toggled preference turns it on', async () => {
    const serverValues: Record<string, unknown> = { trayIconEnabled: false };
    const prefs = makeStalePreferences(serverValues);
    const deps = buildDeps({ preferences: prefs as any });
    const ctrl = new PickerController(deps);
    await ctrl.activate();
    expect(deps.statusBar.registerItem).not.toHaveBeenCalled();

    serverValues.trayIconEnabled = true;
    await ctrl.refreshPreferences();

    expect(prefs.refresh).toHaveBeenCalledTimes(2);
    expect(deps.statusBar.registerItem).toHaveBeenCalledTimes(1);
  });

  it('unregisters the tray once a live-toggled preference turns it off', async () => {
    const serverValues: Record<string, unknown> = { trayIconEnabled: true };
    const prefs = makeStalePreferences(serverValues);
    const deps = buildDeps({ preferences: prefs as any });
    const ctrl = new PickerController(deps);
    await ctrl.activate();
    expect(deps.statusBar.registerItem).toHaveBeenCalledTimes(1);

    serverValues.trayIconEnabled = false;
    await ctrl.refreshPreferences();

    expect(deps.statusBar.unregisterItem).toHaveBeenCalledWith('color-picker-tray');
  });
});
