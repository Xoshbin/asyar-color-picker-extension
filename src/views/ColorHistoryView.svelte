<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ActionContext,
    type ExtensionContext,
    type IActionService,
    type IClipboardHistoryService,
    type IExtensionManager,
    type IFeedbackService,
    type IStorageService,
  } from 'asyar-sdk/view';
  import {
    loadHistory,
    toggleFavorite,
    deleteHistoryEntry,
    clearHistory,
    filterHistory,
    resolveFocusedEntry,
  } from '../lib/history';
  import {
    formatColor,
    resolveFormatPreference,
    type ColorFormat,
  } from '../lib/color/format';
  import { syncWorkerPreferences } from '../lib/preferencesSync';
  import type { HistoryEntry } from '../lib/types';

  let { context, extensionId } = $props<{ context: ExtensionContext; extensionId: string }>();

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
  let defaultFormat: ColorFormat = $derived(
    resolveFormatPreference(context.preferences.values.defaultFormat),
  );
  let uppercaseHex = $derived(Boolean(context.preferences.values.uppercaseHex));

  function clipboardTextItem(content: string) {
    return {
      id: `clr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'text' as const,
      content,
      createdAt: Date.now(),
      favorite: false,
    };
  }

  function displayHex(entry: HistoryEntry): string {
    return formatColor({ r: entry.r, g: entry.g, b: entry.b, a: 1 }, 'hex', { uppercaseHex });
  }

  function timeAgo(timestamp: number): string {
    const minutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  async function copyEntry(entry: HistoryEntry, format: ColorFormat = defaultFormat): Promise<void> {
    const text = formatColor({ r: entry.r, g: entry.g, b: entry.b, a: 1 }, format, {
      uppercaseHex,
    });
    await clipboard.writeToClipboard(clipboardTextItem(text));
    await feedback.showHUD(`Copied ${text}`);
  }

  async function reload(): Promise<void> {
    entries = await loadHistory(storage);
    if (filtered.length > 0 && !filtered.find((entry) => entry.id === focusedId)) {
      focusedId = filtered[0].id;
    } else if (filtered.length === 0) {
      focusedId = null;
    }
    extensionManager?.setActiveViewSubtitle(
      entries.length === 0 ? null : `${entries.length} color${entries.length === 1 ? '' : 's'}`,
    );
  }

  function ensureVisible(): void {
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-entry-id="${focusedId}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    });
  }

  function moveSelection(direction: 1 | -1): void {
    if (filtered.length === 0) return;
    const index = focusedId ? filtered.findIndex((entry) => entry.id === focusedId) : -1;
    const next = index < 0 ? 0 : Math.max(0, Math.min(filtered.length - 1, index + direction));
    focusedId = filtered[next].id;
    ensureVisible();
  }

  function isEditingLocally(): boolean {
    const active = document.activeElement;
    if (!active) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
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
    if (isEditingLocally()) return;
    const key = (data.payload as { key?: string } | undefined)?.key;
    if (key === 'ArrowDown' || key === 'ArrowRight') moveSelection(1);
    else if (key === 'ArrowUp' || key === 'ArrowLeft') moveSelection(-1);
  }

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
      actions.registerAction({
        id: `${extensionId}.history.copy-${format}`,
        title: `Copy ${FORMAT_LABEL[format]}`,
        description: 'Copy the highlighted color in this format.',
        category: 'Copy',
        extensionId,
        context: ActionContext.EXTENSION_VIEW,
        execute: async () => {
          const entry = resolveFocusedEntry(filtered, focusedId);
          if (!entry) return;
          await copyEntry(entry, format);
        },
      });
    }

    // ⏎ copies in the user's default format — the same thing a row click does.
    actions.registerAction({
      id: `${extensionId}.history.copy-default`,
      title: 'Copy color',
      description: 'Copy the highlighted color in your default format.',
      category: 'Copy',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      primary: true,
      shortcut: 'Enter',
      execute: async () => {
        const entry = resolveFocusedEntry(filtered, focusedId);
        if (!entry) return;
        await copyEntry(entry);
      },
    });

    actions.registerAction({
      id: `${extensionId}.history.copy-hex`,
      title: 'Copy HEX',
      description: 'Copy the highlighted color as a hex value.',
      category: 'Copy',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      shortcut: 'Mod+Shift+C',
      execute: async () => {
        const entry = resolveFocusedEntry(filtered, focusedId);
        if (!entry) return;
        await copyEntry(entry, 'hex');
      },
    });

    actions.registerAction({
      id: `${extensionId}.history.toggle-favorite`,
      title: 'Toggle favorite',
      description: 'Pin or unpin the highlighted color.',
      category: 'Edit',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      shortcut: 'Mod+F',
      execute: async () => {
        const entry = resolveFocusedEntry(filtered, focusedId);
        if (!entry) return;
        await toggleFavorite(storage, entry.id);
        await reload();
      },
    });

    // Destructive actions confirm through the host dialog and bind only the
    // approved delete chords — never ⌘⌫, which belongs to text editing.
    actions.registerAction({
      id: `${extensionId}.history.delete`,
      title: 'Delete color',
      description: 'Remove the highlighted color from history.',
      category: 'Edit',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      destructive: true,
      confirm: true,
      shortcut: 'Control+X',
      execute: async () => {
        const entry = resolveFocusedEntry(filtered, focusedId);
        if (!entry) return;
        const index = filtered.findIndex((candidate) => candidate.id === entry.id);
        await deleteHistoryEntry(storage, entry.id);
        await reload();
        focusedId = filtered[Math.min(index, filtered.length - 1)]?.id ?? null;
        ensureVisible();
      },
    });

    actions.registerAction({
      id: `${extensionId}.history.clear-all`,
      title: 'Clear history (keeps favorites)',
      description: 'Remove every non-favorited color from history.',
      category: 'Edit',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      destructive: true,
      confirm: true,
      shortcut: 'Control+Shift+X',
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
  });
</script>

<div class="wrap">
  {#if loading}
    <p class="state-hint loading">Loading colors…</p>
  {:else if entries.length === 0}
    <div class="state">
      <p class="state-title">No colors picked yet</p>
      <p class="state-hint">Run "Pick color" to sample your screen. Picks land here, newest first.</p>
    </div>
  {:else if filtered.length === 0}
    <div class="state">
      <p class="state-title">No colors match "{query}"</p>
      <p class="state-hint">Search matches the hex value, so try "#1f" or "ff".</p>
    </div>
  {:else}
    <div class="list custom-scrollbar">
      {#each filtered as entry (entry.id)}
        {@const isFocused = entry.id === focusedId}
        <button
          type="button"
          class="row"
          class:selected={isFocused}
          data-entry-id={entry.id}
          aria-label={`${displayHex(entry)}${entry.favorite ? ' (favorite)' : ''}`}
          aria-current={isFocused ? 'true' : undefined}
          onclick={() => {
            focusedId = entry.id;
            void copyEntry(entry);
          }}
          onmouseenter={() => (focusedId = entry.id)}
        >
          <span class="swatch" style="background-color: {entry.hex}" aria-hidden="true"></span>
          <span class="hex">{displayHex(entry)}</span>
          <span class="time">{timeAgo(entry.timestamp)}</span>
          {#if entry.favorite}
            <span class="star" aria-hidden="true">★</span>
          {/if}
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
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-ui);
  }

  .list {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    height: var(--shell-row-h);
    padding: 0 var(--space-2);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: default;
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
    flex: 0 0 auto;
    width: var(--size-md);
    height: var(--size-md);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
  }

  .hex {
    font-family: var(--font-mono);
    font-size: var(--font-size-base);
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
  }

  .time {
    flex: 1 1 auto;
    overflow: hidden;
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .star {
    flex: 0 0 auto;
    font-size: var(--font-size-xs);
    color: var(--accent-warning);
  }

  .state {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-2);
    height: 100%;
    padding: var(--space-6) var(--space-4);
  }
  .state-title {
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--text-primary);
  }
  .state-hint {
    margin: 0;
    font-size: var(--font-size-sm);
    line-height: 1.55;
    color: var(--text-tertiary);
  }
  .loading {
    padding: var(--space-2) var(--space-2);
  }
</style>
