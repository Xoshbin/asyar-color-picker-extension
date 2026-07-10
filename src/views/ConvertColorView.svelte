<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ActionContext,
    type ExtensionContext,
    type IActionService,
    type IClipboardHistoryService,
    type IInteropService,
    type IFeedbackService,
    type IExtensionManager,
  } from 'asyar-sdk/view';
  import { parseColor } from '../lib/color/convert';
  import { formatColor, type ColorFormat } from '../lib/color/format';
  import { nearestNamedColor } from '../lib/color/namedColors';
  import { contrastRatio, wcagLevel } from '../lib/color/contrast';
  import { buildNameColorQuery, buildPaletteFromColorQuery } from '../lib/aiPrompts';
  import { syncWorkerPreferences } from '../lib/preferencesSync';

  let { context, extensionId } = $props<{ context: ExtensionContext; extensionId: string }>();

  let input = $state('');
  let secondInput = $state('#ffffff');

  let parsed = $derived(parseColor(input));
  let secondParsed = $derived(parseColor(secondInput));
  let uppercaseHex = $derived(Boolean(context.preferences.values.uppercaseHex));

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

  let formatted = $derived.by(() => {
    if (!parsed) return null;
    const out: Partial<Record<ColorFormat, string>> = {};
    for (const f of FORMATS) out[f] = formatColor(parsed, f, { uppercaseHex });
    return out;
  });

  let nearest = $derived(parsed ? nearestNamedColor(parsed) : null);
  let contrast = $derived(parsed && secondParsed ? contrastRatio(parsed, secondParsed) : null);
  let levelNormal = $derived(contrast !== null ? wcagLevel(contrast, false) : null);
  let levelLarge = $derived(contrast !== null ? wcagLevel(contrast, true) : null);

  let aiError = $state<string | null>(null);

  let actions: IActionService;
  let clipboard: IClipboardHistoryService;
  let interop: IInteropService;
  let feedback: IFeedbackService;
  let extensionManager: IExtensionManager;

  function clipboardTextItem(content: string) {
    return {
      id: `clr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'text' as const,
      content,
      createdAt: Date.now(),
      favorite: false,
    };
  }

  /**
   * Hands off to the built-in `agents` extension's own "Ask AI" command —
   * this opens a real, tool-capable agent chat thread (navigating away from
   * this view), rather than streaming a raw completion inline here.
   */
  async function askAgent(query: string): Promise<void> {
    aiError = null;
    try {
      await interop.launchCommand('agents', 'ask', { query });
    } catch (err) {
      aiError = err instanceof Error ? err.message : String(err);
    }
  }

  function runNameColor(): void {
    if (!parsed) return;
    const hex = formatColor(parsed, 'hex', { uppercaseHex: false });
    void askAgent(buildNameColorQuery(hex));
  }

  function runGeneratePalette(): void {
    if (!parsed) return;
    const hex = formatColor(parsed, 'hex', { uppercaseHex: false });
    void askAgent(buildPaletteFromColorQuery(hex));
  }

  // `searchable: true` in the manifest routes the launcher's own search bar
  // into the view as this message instead of a local <input> here.
  function handleHostMessage(event: MessageEvent): void {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'asyar:view:search') return;
    input = (data.payload as { query?: string } | undefined)?.query ?? '';
  }

  const ACTION_IDS: string[] = [];
  let unsyncPrefs: (() => void) | null = null;

  onMount(() => {
    window.addEventListener('message', handleHostMessage);
    actions = context.getService('actions');
    clipboard = context.getService('clipboard');
    interop = context.getService('interop');
    feedback = context.getService('feedback');
    extensionManager = context.getService('extensions');
    extensionManager.setActiveViewActionLabel('⌘K for copy + AI actions');

    unsyncPrefs = syncWorkerPreferences(context);

    for (const format of FORMATS) {
      const id = `${extensionId}.convert.copy-${format}`;
      ACTION_IDS.push(id);
      actions.registerAction({
        id,
        title: `Copy as ${FORMAT_LABEL[format]}`,
        category: 'Copy',
        extensionId,
        context: ActionContext.EXTENSION_VIEW,
        execute: async () => {
          if (!parsed) return;
          const text = formatColor(parsed, format, { uppercaseHex });
          await clipboard.writeToClipboard(clipboardTextItem(text));
          await feedback.showHUD(`Copied ${text}`);
        },
      });
    }

    const nameId = `${extensionId}.convert.ai-name`;
    ACTION_IDS.push(nameId);
    actions.registerAction({
      id: nameId,
      title: 'AI: Name This Color',
      category: 'AI',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => runNameColor(),
    });

    const paletteId = `${extensionId}.convert.ai-palette`;
    ACTION_IDS.push(paletteId);
    actions.registerAction({
      id: paletteId,
      title: 'AI: Generate Palette',
      category: 'AI',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => runGeneratePalette(),
    });
  });

  onDestroy(() => {
    window.removeEventListener('message', handleHostMessage);
    unsyncPrefs?.();
    extensionManager?.setActiveViewActionLabel(null);
    for (const id of ACTION_IDS) {
      try {
        actions.unregisterAction(id);
      } catch {
        /* ignore */
      }
    }
  });
</script>

<div class="wrap custom-scrollbar">
  <div class="row">
    <div class="field">
      <span class="label">Color</span>
      <span class="value">{input || '—'}</span>
    </div>
    {#if parsed}
      <span class="preview" style="background-color: {formatted?.hex}"></span>
    {/if}
  </div>

  {#if !parsed}
    {#if !input}
      <p class="hint">
        Type a color in the search bar above — hex, rgb(), hsl(), hsb(), oklch(), lch(), or
        color(display-p3 …).
      </p>
    {:else}
      <p class="hint">
        Could not parse "{input}". Try a hex, rgb(), hsl(), hsb(), oklch(), lch(), or
        color(display-p3 …) value.
      </p>
    {/if}
  {:else}
    <section class="card">
      <h2 class="section-title">Formats</h2>
      <ul class="formats">
        {#each FORMATS as f (f)}
          <li><span class="fmt-label">{FORMAT_LABEL[f]}</span><span class="fmt-value">{formatted?.[f]}</span></li>
        {/each}
      </ul>
      {#if nearest}
        <p class="nearest">Nearest named color: <strong>{nearest.name}</strong> (Δ {Math.round(nearest.distance)})</p>
      {/if}
    </section>

    <section class="card">
      <h2 class="section-title">Contrast checker</h2>
      <label class="field">
        <span class="label">Against</span>
        <input type="text" class="input" bind:value={secondInput} placeholder="#ffffff" />
      </label>
      {#if contrast !== null}
        <p class="contrast-ratio">{contrast.toFixed(2)}:1</p>
        <p class="contrast-levels">
          Normal text: <strong>{levelNormal}</strong> · Large text: <strong>{levelLarge}</strong>
        </p>
      {:else}
        <p class="hint">Enter a valid second color to check contrast.</p>
      {/if}
    </section>

    <section class="card">
      <h2 class="section-title">AI</h2>
      {#if aiError}
        <p class="error">{aiError}</p>
      {:else}
        <p class="hint">
          Use ⌘K → "AI: Name This Color" or "AI: Generate Palette" — opens a new agent chat
          thread with this color.
        </p>
      {/if}
    </section>
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
    padding: var(--space-5);
    gap: var(--space-4);
    overflow-y: auto;
    font-family: var(--font-ui);
    color: var(--text-primary);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
  }

  .label {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }

  .value {
    font-family: var(--font-mono);
    font-size: var(--font-size-base);
    color: var(--text-primary);
  }

  .input {
    width: 100%;
    padding: 7px var(--space-4);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
    background: var(--bg-secondary-full-opacity);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--font-size-base);
    outline: none;
  }
  .input:focus {
    border-color: var(--accent-primary);
  }

  .preview {
    width: var(--space-9);
    height: var(--space-9);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  .card {
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .section-title {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .formats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .formats li {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
  }
  .fmt-label {
    color: var(--text-tertiary);
  }
  .fmt-value {
    color: var(--text-primary);
  }

  .nearest {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    margin: 0;
  }

  .contrast-ratio {
    font-size: var(--font-size-lg);
    font-weight: 600;
    margin: 0;
  }
  .contrast-levels {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    margin: 0;
  }

  .hint {
    color: var(--text-tertiary);
    font-size: var(--font-size-sm);
    margin: 0;
  }

  .error {
    color: var(--accent-danger);
    font-size: var(--font-size-sm);
    margin: 0;
  }
</style>
