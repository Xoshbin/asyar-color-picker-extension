// ───────────────────────────────────────────────────────────────────────────
// worker.ts — Tier 2 Color Picker extension worker entry, loaded by
// dist/worker.html. Owns the tray registration (survives window close) and
// the tray-triggered "Pick Color" flow. All 3 manifest commands are
// `mode: "view"`, so the view iframe owns command dispatch entirely — this
// worker never routes a user command through executeCommand().
// ───────────────────────────────────────────────────────────────────────────

import {
  ExtensionContext as WorkerExtensionContext,
  extensionBridge,
} from 'asyar-sdk/worker';
import type {
  Extension,
  ExtensionContext,
  ILogService,
  IStorageService,
  IStatusBarService,
  IScreenService,
  IFeedbackService,
} from 'asyar-sdk/contracts';
import manifest from '../manifest.json';
import { PickerController, type PreferencesView } from './lib/pickerController';
import type { CanvasLike } from './lib/swatchIcon';

const extensionId =
  window.location.hostname === 'localhost' ||
  window.location.hostname === 'asyar-extension.localhost'
    ? window.location.pathname.split('/').filter(Boolean)[0] || 'org.asyar.color-picker'
    : window.location.hostname || 'org.asyar.color-picker';

const workerContext = new WorkerExtensionContext();
workerContext.setExtensionId(extensionId);

const log = workerContext.getService<ILogService>('log');

const controller = new PickerController({
  storage: workerContext.getService<IStorageService>('storage'),
  statusBar: workerContext.getService<IStatusBarService>('statusBar'),
  screen: workerContext.getService<IScreenService>('screen'),
  notifications: workerContext.getService<IFeedbackService>('feedback'),
  preferences: workerContext.preferences as PreferencesView,
  log,
  createCanvas: () => document.createElement('canvas') as unknown as CanvasLike,
  now: () => Date.now(),
  genId: () => crypto.randomUUID(),
});

// Worker preferences are never live-pushed (see PickerController.refreshPreferences
// doc) — the view pings this so the tray reconciles without an app restart.
workerContext.onRequest<undefined, void>('refresh-preferences', async () => {
  await controller.refreshPreferences();
});

class ColorPickerWorkerExtension implements Extension {
  async initialize(_ctx: ExtensionContext): Promise<void> {}

  async activate(): Promise<void> {
    await controller.activate();
  }

  async deactivate(): Promise<void> {}

  async executeCommand(): Promise<unknown> {
    // Every command is `mode: "view"` — the host navigates the view iframe
    // directly and never dispatches through this worker's executeCommand.
    return undefined;
  }

  onUnload = (): void => {};
}

const colorPickerExtension = new ColorPickerWorkerExtension();

extensionBridge.registerManifest(
  manifest as Parameters<typeof extensionBridge.registerManifest>[0],
);
extensionBridge.registerExtensionImplementation(extensionId, colorPickerExtension);

void (async () => {
  try {
    await colorPickerExtension.activate();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`[${extensionId}] worker activate failed: ${msg}`);
  }
})();

window.addEventListener('beforeunload', () => {
  void colorPickerExtension.deactivate();
});

export { controller as pickerController };
