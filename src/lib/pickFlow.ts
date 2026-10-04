import type { IStatusBarService, IScreenService, PickedColor } from 'asyar-sdk/contracts';
import { loadHistory, prependHistory } from './history';
import { renderTrayMenu, TRAY_ITEM_ID } from './trayMenu';
import { createSwatchIconDataUri, type CanvasLike } from './swatchIcon';
import type { HistoryEntry } from './types';

const RECENT_ROWS = 5;

export interface ClipboardWriter {
  writeToClipboard(item: {
    id: string;
    type: 'text';
    content: string;
    createdAt: number;
    favorite: boolean;
  }): Promise<void>;
}

export interface StorageView {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export interface PickFlowDeps {
  hideLauncher: () => void;
  showHUD: (title: string) => Promise<void>;
  screen: IScreenService;
  clipboard: ClipboardWriter;
  storage: StorageView;
  statusBar: IStatusBarService;
  preferences: { values: Readonly<Record<string, unknown>> };
  createCanvas: () => CanvasLike;
  now: () => number;
  genId: () => string;
  /** Renders the picked color per the user's default-format + hex-case preferences. */
  formatForClipboard: (picked: PickedColor) => string;
}

function historyLimit(preferences: PickFlowDeps['preferences']): number {
  const v = preferences.values.historyLimit;
  return typeof v === 'number' && Number.isFinite(v) ? v : 50;
}

/**
 * The full "Pick Color" flow, run entirely from the view — the worker has
 * no clipboard/HUD/hideLauncher access (see asyar-sdk/worker's header
 * comment), so this cannot be split across the worker/view boundary.
 *
 * Picking happens BEFORE hiding: the launcher's hide path parks the panel
 * and gives up key-window status (see `park_launcher_panel` in the Rust
 * launcher), which stops the native color sampler from engaging at all.
 * Asyar must stay the active app for the whole pick, then hide once done.
 *
 * `hideLauncher()` also pops the view's navigation stack (not just the OS
 * window), so it must fire AFTER every clipboard/storage/tray write — calling
 * it earlier unmounts this view's iframe mid-flight and the launcher then
 * rejects every remaining postMessage as coming from an untrusted frame.
 * `showHUD` alone hides the OS window but does NOT pop the nav stack, so
 * without an explicit call here the next launch reopens on this same,
 * already-finished view.
 */
export async function runPickFlow(deps: PickFlowDeps): Promise<PickedColor | null> {
  await deps.showHUD('Click any pixel — Esc cancels');

  const picked = await deps.screen.pickColor();
  if (!picked) {
    deps.hideLauncher();
    return null;
  }

  const formatted = deps.formatForClipboard(picked);
  await deps.clipboard.writeToClipboard({
    id: `clr-${deps.now()}`,
    type: 'text',
    content: formatted,
    createdAt: deps.now(),
    favorite: false,
  });
  await deps.showHUD(`Copied ${formatted}`);

  const entry: HistoryEntry = {
    id: deps.genId(),
    hex: picked.hex,
    r: picked.r,
    g: picked.g,
    b: picked.b,
    timestamp: deps.now(),
    favorite: false,
  };
  await prependHistory(deps.storage as any, entry, historyLimit(deps.preferences));

  if (Boolean(deps.preferences.values.trayIconEnabled)) {
    const history = await loadHistory(deps.storage as any);
    const recent = history.slice(0, RECENT_ROWS);
    const swatchIconPath = recent[0]
      ? await createSwatchIconDataUri(recent[0].hex, deps.createCanvas)
      : null;
    const item = renderTrayMenu({ swatchIconPath, recent }, { trayIconEnabled: true });
    if (item) deps.statusBar.registerItem(item);
  }

  deps.hideLauncher();
  return picked;
}
