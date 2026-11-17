<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ActionContext,
    type ExtensionContext,
    type IActionService,
    type IClipboardHistoryService,
    type IEnvironmentService,
    type IFeedbackService,
    type IInteropService,
  } from 'asyar-sdk/view';
  import { parseColor } from '../lib/color/convert';
  import { formatColor, type ColorFormat } from '../lib/color/format';
  import { nearestNamedColor } from '../lib/color/namedColors';
  import { displayColorName } from '../lib/color/colorName';
  import {
    contrastRatio,
    relativeLuminance,
    wcagLevel,
    type RGB255,
  } from '../lib/color/contrast';
  import { buildNameColorQuery, buildPaletteFromColorQuery } from '../lib/aiPrompts';
  import { syncWorkerPreferences } from '../lib/preferencesSync';

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
  /** Row pills stay short so the mono value keeps its column width. */
  const FORMAT_PILL: Record<ColorFormat, string> = {
    hex: 'HEX',
    rgb: 'RGB',
    hsl: 'HSL',
    hsb: 'HSB',
    oklch: 'OKLCH',
    lch: 'LCH',
    p3: 'P3',
  };

  const WHITE: RGB255 = { r: 255, g: 255, b: 255 };
  const BLACK: RGB255 = { r: 0, g: 0, b: 0 };

  interface ContrastRow {
    label: string;
    hex: string;
    ratio: number;
  }

  let input = $state('');
  let secondInput = $state('#ffffff');
  let activeIndex = $state(0);
  let aiError = $state<string | null>(null);
  let platform = $state<'macos' | 'windows' | 'linux' | null>(null);

  let parsed = $derived(parseColor(input));
  let secondParsed = $derived(parseColor(secondInput));
  let uppercaseHex = $derived(Boolean(context.preferences.values.uppercaseHex));

  let formatted = $derived.by(() => {
    if (!parsed) return null;
    const out = {} as Record<ColorFormat, string>;
    for (const format of FORMATS) out[format] = formatColor(parsed, format, { uppercaseHex });
    return out;
  });

  let activeFormat = $derived(FORMATS[activeIndex]);
  let nearest = $derived(parsed ? nearestNamedColor(parsed) : null);
  let nearestName = $derived(nearest ? displayColorName(nearest.name) : '');
  let luminancePercent = $derived(parsed ? Math.round(relativeLuminance(parsed) * 100) : 0);
  let alphaPercent = $derived(parsed ? Math.round(parsed.a * 100) : 100);
  /** `Mod` is ⌘ on macOS and Ctrl elsewhere; the hint has to say which. */
  let modGlyph = $derived(platform === 'windows' || platform === 'linux' ? 'Ctrl+' : '⌘');

  let contrastRows: ContrastRow[] = $derived.by(() => {
    if (!parsed) return [];
    const rows: ContrastRow[] = [
      { label: 'White', hex: '#FFFFFF', ratio: contrastRatio(parsed, WHITE) },
      { label: 'Black', hex: '#000000', ratio: contrastRatio(parsed, BLACK) },
    ];
    if (secondParsed) {
      const isWhite = secondParsed.r === 255 && secondParsed.g === 255 && secondParsed.b === 255;
      const isBlack = secondParsed.r === 0 && secondParsed.g === 0 && secondParsed.b === 0;
      if (!isWhite && !isBlack) {
        rows.push({
          label: 'Custom',
          hex: formatColor(secondParsed, 'hex', { uppercaseHex: true }),
          ratio: contrastRatio(parsed, secondParsed),
        });
      }
    }
    return rows;
  });

  let actions: IActionService;
  let clipboard: IClipboardHistoryService;
  let interop: IInteropService;
  let feedback: IFeedbackService;
  let unsyncPrefs: (() => void) | null = null;

  function clipboardTextItem(content: string) {
    return {
      id: `clr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'text' as const,
      content,
      createdAt: Date.now(),
      favorite: false,
    };
  }

  async function copyFormat(format: ColorFormat): Promise<void> {
    if (!parsed) return;
    const text = formatColor(parsed, format, { uppercaseHex });
    await clipboard.writeToClipboard(clipboardTextItem(text));
    await feedback.showHUD(`Copied ${text}`);
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

  /** Arrow keys belong to the caret while the contrast field is being edited. */
  function isEditingLocally(): boolean {
    const active = document.activeElement;
    if (!active) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
  }

  function moveSelection(direction: 1 | -1): void {
    activeIndex = Math.max(0, Math.min(FORMATS.length - 1, activeIndex + direction));
  }

  // `searchable: true` in the manifest routes the launcher's own search bar
  // into the view as this message instead of a local <input> here.
  function handleHostMessage(event: MessageEvent): void {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'asyar:view:search') {
      input = (data.payload as { query?: string } | undefined)?.query ?? '';
      return;
    }
    if (data.type !== 'asyar:view:keydown') return;

    const key = (data.payload as { key?: string } | undefined)?.key;
    if (!key || isEditingLocally()) return;
    if (key === 'ArrowDown') moveSelection(1);
    else if (key === 'ArrowUp') moveSelection(-1);
    else if (key === 'Enter') void copyFormat(activeFormat);
  }

  onMount(() => {
    actions = context.getService('actions');
    clipboard = context.getService('clipboard');
    interop = context.getService('interop');
    feedback = context.getService('feedback');

    unsyncPrefs = syncWorkerPreferences(context);
    window.addEventListener('message', handleHostMessage);

    void context
      .getService<IEnvironmentService>('environment')
      .getEnvironment()
      .then((environment) => {
        platform = environment.platform;
      })
      .catch(() => {
        // Unknown platform keeps the ⌘ glyph, which is the host's default.
      });

    // ⌘1…⌘7 copy a format outright; ⏎ copies whichever row is highlighted.
    FORMATS.forEach((format, index) => {
      actions.registerAction({
        id: `${extensionId}.convert.copy-${format}`,
        title: `Copy ${FORMAT_LABEL[format]}`,
        description: 'Copy this format to the clipboard.',
        category: 'Copy',
        extensionId,
        context: ActionContext.EXTENSION_VIEW,
        shortcut: `Mod+${index + 1}`,
        execute: () => copyFormat(format),
      });
    });

    actions.registerAction({
      id: `${extensionId}.convert.copy-active`,
      title: 'Copy color',
      description: 'Copy the highlighted format and close the launcher.',
      category: 'Copy',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      primary: true,
      shortcut: 'Enter',
      execute: () => copyFormat(activeFormat),
    });

    actions.registerAction({
      id: `${extensionId}.convert.ai-name`,
      title: 'Name this color',
      description: 'Ask an agent what this color is called.',
      category: 'AI',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => runNameColor(),
    });

    actions.registerAction({
      id: `${extensionId}.convert.ai-palette`,
      title: 'Generate a palette',
      description: 'Ask an agent for a palette built around this color.',
      category: 'AI',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => runGeneratePalette(),
    });
  });

  onDestroy(() => {
    window.removeEventListener('message', handleHostMessage);
    unsyncPrefs?.();
  });
</script>

<div class="wrap custom-scrollbar">
  {#if !parsed}
    <div class="state">
      {#if input.trim()}
        <p class="state-title">Couldn't read that color</p>
        <p class="state-hint">
          <span class="mono">{input}</span> isn't a color. Try <span class="mono">#4f7cff</span>, or an
          <span class="mono">oklch()</span> value.
        </p>
      {:else}
        <p class="state-title">Convert a color</p>
        <p class="state-hint">
          Type a value in the search bar — <span class="mono">#4f7cff</span>,
          <span class="mono">rgb()</span>, <span class="mono">hsl()</span>,
          <span class="mono">hsb()</span>, <span class="mono">oklch()</span>,
          <span class="mono">lch()</span> or <span class="mono">color(display-p3 …)</span>.
        </p>
      {/if}
    </div>
  {:else}
    <section class="hero">
      <span class="hero-swatch" style="background-color: {formatted?.hex}" aria-hidden="true"
      ></span>
      <div class="hero-body">
        <p class="hero-name" title={nearest?.name}>{nearestName}</p>
        <p class="hero-hex">{formatted?.hex}</p>
        <div class="hero-pills">
          <span class="pill"
            ><span class="pill-key">Luminance</span><span class="pill-value"
              >{luminancePercent}%</span
            ></span
          >
          <span class="pill"
            ><span class="pill-key">Alpha</span><span class="pill-value">{alphaPercent}%</span
            ></span
          >
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2 class="card-title">Formats</h2>
        <span class="card-note">⏎ copies</span>
      </div>
      <ul class="formats">
        {#each FORMATS as format, index (format)}
          <li>
            <button
              type="button"
              class="format-row"
              class:selected={index === activeIndex}
              onclick={() => {
                activeIndex = index;
                void copyFormat(format);
              }}
              onmouseenter={() => (activeIndex = index)}
              title="Copy {FORMAT_LABEL[format]}"
            >
              <span class="format-pill">{FORMAT_PILL[format]}</span>
              <span class="format-value">{formatted?.[format]}</span>
              <span class="keycap">{index === activeIndex ? '⏎' : `${modGlyph}${index + 1}`}</span>
            </button>
          </li>
        {/each}
      </ul>
    </section>

    <section class="card">
      <div class="card-head">
        <h2 class="card-title">Contrast</h2>
        <span class="card-note">WCAG 2.1</span>
      </div>
      <ul class="contrast">
        {#each contrastRows as row (row.label)}
          {@const level = wcagLevel(row.ratio, false)}
          <li class="contrast-row">
            <span class="contrast-label"
              >{row.label}<span class="contrast-hex">{row.hex}</span></span
            >
            <span class="contrast-ratio">{row.ratio.toFixed(2)}:1</span>
            <span class="badge" class:badge-fail={level === 'fail'}
              >{level === 'fail' ? 'Fail' : level}</span
            >
          </li>
        {/each}
      </ul>
      <label class="compare">
        <span class="compare-label">Compare with</span>
        <input
          class="input"
          type="text"
          bind:value={secondInput}
          placeholder="#ffffff"
          spellcheck="false"
          autocomplete="off"
        />
        {#if secondInput.trim() && !secondParsed}
          <span class="compare-error">Not a color</span>
        {/if}
      </label>
    </section>

    <section class="card">
      <div class="card-head">
        <h2 class="card-title">AI</h2>
        <span class="card-note">Opens an agent chat</span>
      </div>
      <div class="ai-actions">
        <button type="button" class="btn" onclick={runNameColor}>Name this color</button>
        <button type="button" class="btn" onclick={runGeneratePalette}>Generate a palette</button>
      </div>
      {#if aiError}
        <p class="ai-error">{aiError}</p>
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
    gap: var(--space-3);
    overflow-y: auto;
    font-family: var(--font-ui);
    color: var(--text-primary);
  }

  /* Empty and unreadable-input states share one calm block. */
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
  .mono {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  /* Hero — the swatch carries the color, the card carries the name. */
  .hero {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--bg-secondary);
    border: 1px solid var(--separator);
    border-radius: var(--radius-lg);
  }
  .hero-swatch {
    flex: 0 0 auto;
    width: var(--size-3xl);
    height: var(--size-3xl);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
  }
  .hero-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    min-width: 0;
  }
  .hero-name {
    margin: 0;
    overflow: hidden;
    font-size: var(--font-size-lg);
    font-weight: 600;
    line-height: 1.2;
    color: var(--text-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hero-hex {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
  }
  .hero-pills {
    display: flex;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 18px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background: var(--bg-tertiary);
    font-size: var(--font-size-2xs);
    color: var(--text-tertiary);
    white-space: nowrap;
  }
  .pill-value {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
  }
  .card-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    padding: 0 var(--space-1);
  }
  .card-title {
    margin: 0;
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--text-secondary);
  }
  .card-note {
    font-size: var(--font-size-2xs);
    color: var(--text-tertiary);
  }

  /* The 38px rhythm: one row per format, no gaps between them. */
  .formats {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .format-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
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
  .format-row:hover {
    background: var(--bg-hover);
  }
  .format-row.selected {
    background: var(--bg-selected);
    box-shadow: inset 0 0 2px 0.5px var(--kbd-rim);
  }
  .format-row:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }
  .format-pill {
    flex: 0 0 46px;
    text-align: center;
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }
  .format-value {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    font-family: var(--font-mono);
    font-size: var(--font-size-base);
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .keycap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-width: 18px;
    height: 18px;
    padding: 0 var(--space-1);
    border: 1px solid var(--kbd-border);
    border-radius: var(--radius-xs);
    font-size: var(--font-size-2xs);
    color: var(--text-tertiary);
  }

  .contrast {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .contrast-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--size-lg);
    padding: 0 var(--space-2);
  }
  .contrast-label {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
  .contrast-hex {
    font-family: var(--font-mono);
    font-size: var(--font-size-2xs);
    color: var(--text-tertiary);
  }
  .contrast-ratio {
    flex: 0 0 auto;
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
  }
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-width: 40px;
    height: 18px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--accent-success) 16%, transparent);
    color: var(--accent-success);
    font-size: var(--font-size-2xs);
    font-weight: 600;
  }
  .badge-fail {
    background: color-mix(in srgb, var(--accent-danger) 16%, transparent);
    color: var(--accent-danger);
  }

  .compare {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-1);
    padding: 0 var(--space-1);
  }
  .compare-label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .input {
    flex: 1 1 auto;
    min-width: 0;
    height: var(--size-lg);
    padding: 0 var(--space-2);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
    outline: none;
  }
  .input:focus {
    border-color: var(--accent-primary);
  }
  .compare-error {
    font-size: var(--font-size-2xs);
    color: var(--accent-danger);
    white-space: nowrap;
  }

  .ai-actions {
    display: flex;
    gap: var(--space-2);
    padding: 0 var(--space-1);
  }
  .btn {
    flex: 1 1 0;
    height: var(--size-lg);
    padding: 0 var(--space-3);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: default;
    transition: background-color var(--dur-instant) var(--ease-travel);
  }
  .btn:hover {
    background: var(--bg-hover);
  }
  .ai-error {
    margin: 0;
    padding: 0 var(--space-1);
    font-size: var(--font-size-2xs);
    color: var(--accent-danger);
  }
</style>
