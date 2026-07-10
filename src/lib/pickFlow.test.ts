import { describe, it, expect, vi } from 'vitest';
import { runPickFlow, type PickFlowDeps } from './pickFlow';

function makeStorage() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    delete: vi.fn(async (k: string) => store.delete(k)),
  };
}

function makeStatusBar() {
  return { registerItem: vi.fn(), updateItem: vi.fn(), unregisterItem: vi.fn() };
}

function fakeCanvas() {
  const ctx = { fillStyle: '', fillRect: vi.fn() };
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toDataURL: vi.fn(() => 'data:image/png;base64,X'),
  };
}

function buildDeps(overrides: Partial<PickFlowDeps> = {}): PickFlowDeps {
  return {
    hideLauncher: vi.fn(),
    showHUD: vi.fn(async () => {}),
    screen: { pickColor: vi.fn(async () => ({ r: 255, g: 0, b: 0, hex: '#ff0000' })) } as any,
    clipboard: { writeToClipboard: vi.fn(async () => {}) } as any,
    storage: makeStorage() as any,
    statusBar: makeStatusBar() as any,
    preferences: { values: { trayIconEnabled: false, historyLimit: 50, defaultFormat: 'hex' } } as any,
    createCanvas: () => fakeCanvas() as any,
    now: () => 1_000_000,
    genId: () => 'id-1',
    formatForClipboard: (picked) => picked.hex,
    ...overrides,
  };
}

describe('runPickFlow', () => {
  it('shows the "click any pixel" HUD, then picks — never hides before picking', async () => {
    const deps = buildDeps();
    const order: string[] = [];
    (deps.screen.pickColor as any).mockImplementation(async () => {
      order.push('pick');
      return { r: 255, g: 0, b: 0, hex: '#ff0000' };
    });
    (deps.showHUD as any).mockImplementation(async (title: string) => order.push(`hud:${title}`));

    await runPickFlow(deps);

    expect(order[0]).toMatch(/click any pixel/i);
    expect(order[1]).toBe('pick');
  });

  it('hides the launcher on cancel, after the pick attempt resolves', async () => {
    const deps = buildDeps({ screen: { pickColor: vi.fn(async () => null) } as any });
    await runPickFlow(deps);
    expect(deps.hideLauncher).toHaveBeenCalledTimes(1);
  });

  it('hides the launcher once on success, only after the copy/history/tray work is done', async () => {
    const deps = buildDeps();
    const order: string[] = [];
    (deps.clipboard.writeToClipboard as any).mockImplementation(async () => {
      order.push('clipboard');
    });
    (deps.storage.set as any).mockImplementation(async () => {
      order.push('storage');
    });
    (deps.hideLauncher as any).mockImplementation(() => order.push('hide'));

    await runPickFlow(deps);

    expect(deps.hideLauncher).toHaveBeenCalledTimes(1);
    expect(order.at(-1)).toBe('hide');
    expect(order.indexOf('hide')).toBeGreaterThan(order.indexOf('clipboard'));
    expect(order.indexOf('hide')).toBeGreaterThan(order.indexOf('storage'));
  });

  it('returns null and does nothing else when the user cancels (Esc)', async () => {
    const deps = buildDeps({ screen: { pickColor: vi.fn(async () => null) } as any });
    const result = await runPickFlow(deps);
    expect(result).toBeNull();
    expect(deps.clipboard.writeToClipboard).not.toHaveBeenCalled();
    expect(deps.storage.set).not.toHaveBeenCalled();
  });

  it('copies the formatted color and shows a confirmation HUD on success', async () => {
    const deps = buildDeps();
    await runPickFlow(deps);
    expect(deps.clipboard.writeToClipboard).toHaveBeenCalledWith(
      expect.objectContaining({ content: '#ff0000' }),
    );
    expect(deps.showHUD).toHaveBeenCalledWith(expect.stringContaining('#ff0000'));
  });

  it('prepends the pick to history', async () => {
    const deps = buildDeps();
    await runPickFlow(deps);
    expect(deps.storage.set).toHaveBeenCalled();
    const stored = JSON.parse((deps.storage.set as any).mock.calls[0][1]);
    expect(stored[0]).toMatchObject({ hex: '#ff0000', id: 'id-1' });
  });

  it('updates the tray directly when trayIconEnabled is true', async () => {
    const deps = buildDeps({
      preferences: { values: { trayIconEnabled: true, historyLimit: 50 } } as any,
    });
    await runPickFlow(deps);
    expect(deps.statusBar.registerItem).toHaveBeenCalledTimes(1);
  });

  it('does not touch the tray when trayIconEnabled is false', async () => {
    const deps = buildDeps();
    await runPickFlow(deps);
    expect(deps.statusBar.registerItem).not.toHaveBeenCalled();
    expect(deps.statusBar.updateItem).not.toHaveBeenCalled();
  });

  it('returns the picked color on success', async () => {
    const deps = buildDeps();
    const result = await runPickFlow(deps);
    expect(result).toEqual({ r: 255, g: 0, b: 0, hex: '#ff0000' });
  });
});
