// ───────────────────────────────────────────────────────────────────────────
// view.ts — Tier 2 Color Picker extension view entry, loaded by dist/view.html.
// All 3 manifest commands are `mode: "view"`; each mounts its own component.
// The full pick/copy/history/tray flow runs here (not the worker) because
// hideLauncher(), clipboard, and feedback are view-only APIs — see
// lib/pickFlow.ts for why that split is mandatory, not a convenience choice.
// ───────────────────────────────────────────────────────────────────────────

import 'asyar-sdk/tokens.css';
import { mount } from 'svelte';
import {
  ExtensionContext,
  extensionBridge,
  registerIconElement,
  type Extension,
  type IExtensionManager,
} from 'asyar-sdk/view';
import manifest from '../manifest.json';
import PickColorView from './views/PickColorView.svelte';
import ColorHistoryView from './views/ColorHistoryView.svelte';
import ConvertColorView from './views/ConvertColorView.svelte';

const VIEW_FOR_COMMAND: Record<string, string> = {
  'pick-color': 'PickColorView',
  'color-history': 'ColorHistoryView',
  'convert-color': 'ConvertColorView',
};

class ColorPickerViewExtension implements Extension {
  private extensionManager?: IExtensionManager;

  async initialize(ctx: ExtensionContext): Promise<void> {
    this.extensionManager = ctx.getService<IExtensionManager>('extensions');
  }

  async activate(): Promise<void> {}
  async deactivate(): Promise<void> {}

  async executeCommand(commandId: string): Promise<unknown> {
    const component = VIEW_FOR_COMMAND[commandId];
    if (!component) return undefined;
    const viewPath = `${extensionId}/${component}`;
    this.extensionManager?.navigateToView(viewPath);
    return { type: 'view', viewPath };
  }

  onUnload = (): void => {};
}

const extensionId =
  window.location.hostname === 'localhost' ||
  window.location.hostname === 'asyar-extension.localhost'
    ? window.location.pathname.split('/').filter(Boolean)[0] || 'org.asyar.color-picker'
    : window.location.hostname || 'org.asyar.color-picker';

const context = new ExtensionContext();
context.setExtensionId(extensionId);
registerIconElement();

const viewExtension = new ColorPickerViewExtension();
extensionBridge.registerManifest(
  manifest as Parameters<typeof extensionBridge.registerManifest>[0],
);
extensionBridge.registerExtensionImplementation(extensionId, viewExtension);

window.addEventListener('keydown', (event) => {
  const isCommandK = (event.metaKey || event.ctrlKey) && event.key === 'k';
  if (isCommandK) {
    event.preventDefault();
    window.parent.postMessage(
      {
        type: 'asyar:extension:keydown',
        payload: {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
        },
      },
      '*',
    );
  }
});

void (async () => {
  await viewExtension.initialize(context);
  await viewExtension.activate();
})();

const viewName = new URLSearchParams(window.location.search).get('view');
const target = document.getElementById('app');
if (viewName === 'PickColorView' && target) {
  mount(PickColorView, { target, props: { context } });
} else if (viewName === 'ColorHistoryView' && target) {
  mount(ColorHistoryView, { target, props: { context, extensionId } });
} else if (viewName === 'ConvertColorView' && target) {
  mount(ConvertColorView, { target, props: { context, extensionId } });
}
