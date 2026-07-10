<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ActionContext,
    type ExtensionContext,
    type IActionService,
    type IClipboardHistoryService,
    type IStorageService,
    type IFeedbackService,
    type IExtensionManager,
  } from 'asyar-sdk/view';
  import {
    loadHistory,
    toggleFavorite,
    deleteHistoryEntry,
    clearHistory,
    filterHistory,
    resolveFocusedEntry,
  } from '../lib/history';
  import { formatColor, type ColorFormat } from '../lib/color/format';
  import { syncWorkerPreferences } from '../lib/preferencesSync';
  import type { HistoryEntry } from '../lib/types';

  let { context, extensionId } = $props<{ context: ExtensionContext; extensionId: string }>();

  let storage: IStorageService;
  let clipboard: IClipboardHistoryService;
  let actions: IActionService;
  let feedback: IFeedbackService;
  let extensionManager: IExtensionManager;

  let entries = $state<HistoryEntry[]>([]);
  let query = $state('');
  let focusedId = $state<string | null>(null);
  let loading = $state(true);

  let filtered = $derived(filterHistory(entries, query));

  const FORMATS: ColorFormat[] = ['hex', 'rgb', 'hsl', 'hsb', 'oklch', 'lch', 'p3'];
  const FORMAT_LABEL: Record<ColorFormat, string> = {
    hex: 'HEX',
    rgb: 'RGB',
    hsl: 'HSL',
    hsb: 'HSB',
    oklch: 'OKLCH',
    lch: 'LCH',
    p3: 'Display P3',
  };

  function clipboardTextItem(content: string) {
    return {
      id: `clr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'text' as const,
      content,
      createdAt: Date.now(),
      favorite: false,
    };
  }

  async function reload(): Promise<void> {
    entries = await loadHistory(storage);
    if (filtered.length > 0 && !filtered.find((e) => e.id === focusedId)) {
      focusedId = filtered[0].id;
    } else if (filtered.length === 0) {
      focusedId = null;
    }
    extensionManager?.setActiveViewSubtitle(
      entries.length === 0 ? null : `${entries.length} color${entries.length === 1 ? '' : 's'}`,
    );
  }

  function moveSelection(direction: 1 | -1): void {
    if (filtered.length === 0) return;
    const idx = focusedId ? filtered.findIndex((e) => e.id === focusedId) : -1;
    const next = idx < 0 ? 0 : Math.max(0, Math.min(filtered.length - 1, idx + direction));
    focusedId = filtered[next].id;
  }

  function handleHostMessage(event: MessageEvent): void {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    // `searchable: true` in the manifest routes the launcher's own search
    // bar into the view as this message instead of a local <input> here.
    if (data.type === 'asyar:view:search') {
      query = (data.payload as { query?: string } | undefined)?.query ?? '';
      return;
    }
    if (data.type !== 'asyar:view:keydown') return;
    const key = (data.payload as { key?: string } | undefined)?.key;
    if (key === 'ArrowDown' || key === 'ArrowRight') moveSelection(1);
    else if (key === 'ArrowUp' || key === 'ArrowLeft') moveSelection(-1);
  }

  const ACTION_IDS: string[] = [];
  let unsyncPrefs: (() => void) | null = null;

  onMount(() => {
    storage = context.getService('storage');
    clipboard = context.getService('clipboard');
    actions = context.getService('actions');
    feedback = context.getService('feedback');
    extensionManager = context.getService('extensions');

    unsyncPrefs = syncWorkerPreferences(context);
    window.addEventListener('message', handleHostMessage);
    void (async () => {
      await reload();
      loading = false;
    })();

    for (const format of FORMATS) {
      const id = `${extensionId}.history.copy-${format}`;
      ACTION_IDS.push(id);
      actions.registerAction({
        id,
        title: `Copy as ${FORMAT_LABEL[format]}`,
        category: 'Copy',
        extensionId,
        context: ActionContext.EXTENSION_VIEW,
        execute: async () => {
          const entry = resolveFocusedEntry(filtered, focusedId);
          if (!entry) return;
          const uppercaseHex = Boolean(context.preferences.values.uppercaseHex);
          const text = formatColor({ r: entry.r, g: entry.g, b: entry.b, a: 1 }, format, {
            uppercaseHex,
          });
          await clipboard.writeToClipboard(clipboardTextItem(text));
          await feedback.showHUD(`Copied ${text}`);
        },
      });
    }

    const favId = `${extensionId}.history.toggle-favorite`;
    ACTION_IDS.push(favId);
    actions.registerAction({
      id: favId,
      title: 'Toggle Favorite',
      shortcut: '⌘F',
      category: 'Edit',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        const entry = resolveFocusedEntry(filtered, focusedId);
        if (!entry) return;
        await toggleFavorite(storage, entry.id);
        await reload();
      },
    });

    const delId = `${extensionId}.history.delete`;
    ACTION_IDS.push(delId);
    actions.registerAction({
      id: delId,
      title: 'Delete',
      shortcut: '⌘⌫',
      category: 'Edit',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      destructive: true,
      execute: async () => {
        const entry = resolveFocusedEntry(filtered, focusedId);
        if (!entry) return;
        await deleteHistoryEntry(storage, entry.id);
        focusedId = null;
        await reload();
      },
    });

    const clearId = `${extensionId}.history.clear-all`;
    ACTION_IDS.push(clearId);
    actions.registerAction({
      id: clearId,
      title: 'Clear All (keeps favorites)',
      category: 'Edit',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      destructive: true,
      execute: async () => {
        await clearHistory(storage);
        await reload();
      },
    });
  });

  onDestroy(() => {
    unsyncPrefs?.();
    window.removeEventListener('message', handleHostMessage);
    extensionManager?.setActiveViewSubtitle(null);
    for (const id of ACTION_IDS) {
      try {
        actions.unregisterAction(id);
      } catch {
        /* ignore */
      }
    }
  });
</script>

<div class="wrap">
  {#if loading}
    <p class="hint">Loading…</p>
  {:else if entries.length === 0}
    <p class="hint">No colors picked yet. Run "Pick Color" to get started.</p>
  {:else if filtered.length === 0}
    <p class="hint">No colors match "{query}".</p>
  {:else}
    <div class="list custom-scrollbar">
      {#each filtered as entry (entry.id)}
        <button
          class="row"
          class:selected={entry.id === focusedId}
          onclick={() => (focusedId = entry.id)}
        >
          <span class="swatch" style="background-color: {entry.hex}"></span>
          <span class="hex">{entry.hex}</span>
          {#if entry.favorite}<span class="fav">★</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  :global(html, body) {
    height: 100%;
    margin: 0;
    padding: 0;
  }
  :global(#app) {
    height: 100%;
    width: 100%;
  }

  .wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--space-4);
    gap: var(--space-3);
    font-family: var(--font-ui);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow-y: auto;
    flex: 1;
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: transparent;
    cursor: pointer;
    font: inherit;
    text-align: left;
    color: var(--text-primary);
  }
  .row:hover {
    background: var(--bg-hover);
  }
  .row.selected {
    background: var(--bg-selected);
    box-shadow: inset 0 0 2px 0.5px var(--kbd-rim);
  }
  .row:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .swatch {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
  }

  .hex {
    flex: 1;
    font-family: var(--font-mono);
    font-size: var(--font-size-base);
    color: var(--text-primary);
  }

  .fav {
    color: var(--accent-warning);
    font-size: var(--font-size-sm);
  }

  .hint {
    color: var(--text-tertiary);
    font-size: var(--font-size-md);
    margin: var(--space-3) 0;
  }
</style>
