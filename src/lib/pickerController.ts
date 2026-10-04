import type {
  IStatusBarService,
  IScreenService,
  IFeedbackService,
  ILogService,
} from 'asyar-sdk/contracts';
import { loadHistory, prependHistory } from './history';
import { renderTrayMenu, TRAY_ITEM_ID, PICK_COLOR_ITEM_ID } from './trayMenu';
import { createSwatchIconDataUri, type CanvasLike } from './swatchIcon';
import type { HistoryEntry } from './types';

const RECENT_ROWS = 5;

/** Narrow read-only view over `context.preferences`, matching the coffee extension's shape. */
export interface PreferencesView {
  readonly values: Readonly<Record<string, unknown>>;
  refresh?(): Promise<unknown>;
}

/** Narrow storage view — only the methods this controller needs. */
export interface StorageView {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export interface PickerControllerDeps {
  storage: StorageView;
  statusBar: IStatusBarService;
  screen: IScreenService;
  notifications: IFeedbackService;
  preferences: PreferencesView;
  log: ILogService;
  createCanvas: () => CanvasLike;
  now: () => number;
  genId: () => string;
}

/**
 * Worker-side controller: owns tray registration and the tray-triggered
 * "Pick Color" flow (no clipboard here — worker has none, see asyar-sdk/worker).
 */
export class PickerController {
  private trayRegistered = false;

  constructor(private deps: PickerControllerDeps) {}

  async activate(): Promise<void> {
    try {
      await this.deps.preferences.refresh?.();
    } catch {
      // Host unreachable at boot — fall back to whatever snapshot shipped with the iframe.
    }
    await this.refreshTray();
  }

  /**
   * Worker preferences are never live-pushed by the launcher (only the view
   * iframe gets `preferences:set-all`), so the view pings this over RPC on
   * mount and on every preference change to reconcile the tray.
   */
  async refreshPreferences(): Promise<void> {
    await this.deps.preferences.refresh?.();
    await this.refreshTray();
  }

  private trayEnabled(): boolean {
    return Boolean(this.deps.preferences.values.trayIconEnabled);
  }

  private historyLimit(): number {
    const v = this.deps.preferences.values.historyLimit;
    return typeof v === 'number' && Number.isFinite(v) ? v : 50;
  }

  async refreshTray(): Promise<void> {
    const enabled = this.trayEnabled();
    if (!enabled) {
      if (this.trayRegistered) {
        this.deps.statusBar.unregisterItem(TRAY_ITEM_ID);
        this.trayRegistered = false;
      }
      return;
    }

    const history = await loadHistory(this.deps.storage as any);
    const recent = history.slice(0, RECENT_ROWS);
    const swatchIconPath = recent[0]
      ? await createSwatchIconDataUri(recent[0].hex, this.deps.createCanvas)
      : null;

    const item = renderTrayMenu({ swatchIconPath, recent }, { trayIconEnabled: true });
    if (!item) return;

    // renderTrayMenu is a pure function and never embeds live closures — wire
    // the actual click handler here, on the impure/testable controller side.
    const pickRow = item.submenu?.find((row) => row.id === PICK_COLOR_ITEM_ID);
    if (pickRow) pickRow.onClick = () => void this.pickViaTray();

    if (this.trayRegistered) {
      this.deps.statusBar.updateItem(TRAY_ITEM_ID, item);
    } else {
      this.deps.statusBar.registerItem(item);
      this.trayRegistered = true;
    }
  }

  /**
   * Triggered by the tray's own "Pick Color" menu item. Wired as a bare
   * `onClick`, so a rejection here would otherwise be an unhandled
   * rejection — must never throw.
   */
  async pickViaTray(): Promise<void> {
    if (!this.trayEnabled()) return;

    try {
      const picked = await this.deps.screen.pickColor();
      if (!picked) return;

      const entry: HistoryEntry = {
        id: this.deps.genId(),
        hex: picked.hex,
        r: picked.r,
        g: picked.g,
        b: picked.b,
        timestamp: this.deps.now(),
        favorite: false,
      };
      await prependHistory(this.deps.storage as any, entry, this.historyLimit());
      await this.refreshTray();

      await this.deps.notifications.sendBackground({
        title: 'Color Picker',
        body: `Picked ${picked.hex} — open Color History to copy it.`,
      });
    } catch (err) {
      this.deps.log.error(
        `pickViaTray failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
