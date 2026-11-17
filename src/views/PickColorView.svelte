<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type {
    ExtensionContext,
    IClipboardHistoryService,
    IEnvironmentService,
    IFeedbackService,
    IOpenerService,
    IScreenService,
    IStatusBarService,
    IStorageService,
  } from 'asyar-sdk/view';
  import { runPickFlow } from '../lib/pickFlow';
  import { formatColor, resolveFormatPreference } from '../lib/color/format';
  import { syncWorkerPreferences } from '../lib/preferencesSync';

  let { context } = $props<{ context: ExtensionContext }>();

  /**
   * The macOS pane that gates screen capture. Declared in the manifest's
   * `permissionArgs["shell:open-url"]`, so the host lets the opener open it.
   */
  const SCREEN_RECORDING_PANE =
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

  let errorMessage = $state<string | null>(null);
  let platform = $state<'macos' | 'windows' | 'linux' | null>(null);
  let unsyncPrefs: (() => void) | null = null;
  let disposed = false;

  function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  /**
   * Sampling starts on mount: the pipette is the command, so the user should
   * never have to confirm something they already asked for by launching it.
   */
  function startPick(): void {
    if (disposed) return;
    errorMessage = null;

    const feedback = context.getService<IFeedbackService>('feedback');
    void runPickFlow({
      hideLauncher: () => context.hideLauncher(),
      showHUD: (title: string) => feedback.showHUD(title),
      screen: context.getService('screen') as IScreenService,
      clipboard: context.getService('clipboard') as IClipboardHistoryService,
      storage: context.getService('storage') as IStorageService,
      statusBar: context.getService('statusBar') as IStatusBarService,
      preferences: context.preferences,
      createCanvas: () => document.createElement('canvas') as any,
      now: () => Date.now(),
      genId: () => crypto.randomUUID(),
      formatForClipboard: (picked) => {
        const format = resolveFormatPreference(context.preferences.values.defaultFormat);
        const uppercaseHex = Boolean(context.preferences.values.uppercaseHex);
        return formatColor(
          { r: picked.r, g: picked.g, b: picked.b, a: 1 },
          format,
          { uppercaseHex },
        );
      },
    }).catch((err: unknown) => {
      // Cancelling resolves with null, so anything thrown here is a real
      // failure: keep the launcher up and explain it in place.
      if (disposed) return;
      errorMessage = describe(err);
    });
  }

  async function openScreenRecordingSettings(): Promise<void> {
    const opener = context.getService<IOpenerService>('opener');
    try {
      await opener.openUrl(SCREEN_RECORDING_PANE);
    } catch {
      // The banner already spells out the manual path, so a refused deep link
      // is a dead end we can live with rather than an error to escalate.
    }
  }

  onMount(() => {
    unsyncPrefs = syncWorkerPreferences(context);

    void context
      .getService<IEnvironmentService>('environment')
      .getEnvironment()
      .then((environment) => {
        if (!disposed) platform = environment.platform;
      })
      .catch(() => {
        // No environment snapshot means no platform-specific copy; the
        // generic wording below covers it.
      });

    startPick();
  });

  onDestroy(() => {
    disposed = true;
    unsyncPrefs?.();
  });
</script>

<div class="wrap">
  {#if errorMessage}
    <section class="banner" role="alert">
      <div class="banner-head">
        <span class="pip" aria-hidden="true">!</span>
        <h1 class="banner-title">Couldn't sample the screen</h1>
      </div>
      <p class="banner-body">
        {#if platform === 'macos'}
          Allow Asyar under System Settings → Privacy &amp; Security → Screen Recording, then try
          again.
        {:else}
          The system color sampler didn't open. Close any other color picker and try again.
        {/if}
      </p>
      <p class="banner-detail" title={errorMessage}>{errorMessage}</p>
      <div class="banner-actions">
        {#if platform === 'macos'}
          <button type="button" class="btn" onclick={openScreenRecordingSettings}>
            Open System Settings
          </button>
        {/if}
        <button type="button" class="btn btn-primary" onclick={startPick}>Try again</button>
      </div>
    </section>
  {:else}
    <div class="waiting">
      <p class="waiting-title">Waiting for a screen sample</p>
      <p class="waiting-hint">Click any pixel · Esc to cancel</p>
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
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: var(--space-6);
    font-family: var(--font-ui);
  }

  .waiting {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    text-align: center;
  }
  .waiting-title {
    margin: 0;
    font-size: var(--font-size-md);
    color: var(--text-secondary);
  }
  .waiting-hint {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--text-tertiary);
  }

  .banner {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    max-width: 320px;
    padding: var(--space-4);
    background: var(--bg-secondary);
    border: 1px solid var(--separator);
    border-radius: var(--radius-lg);
  }

  .banner-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .pip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--size-md);
    height: var(--size-md);
    flex-shrink: 0;
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--accent-warning) 16%, transparent);
    color: var(--accent-warning);
    font-size: var(--font-size-xs);
    font-weight: 600;
  }

  .banner-title {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--text-primary);
  }

  .banner-body {
    margin: 0;
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--text-secondary);
  }

  .banner-detail {
    margin: 0;
    overflow: hidden;
    font-family: var(--font-mono);
    font-size: var(--font-size-2xs);
    color: var(--text-tertiary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .banner-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }

  .btn {
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

  .btn-primary {
    border-color: transparent;
    background: var(--accent-primary-fill);
    color: var(--text-on-accent);
  }
  .btn-primary:hover {
    background: color-mix(in srgb, var(--accent-primary-fill) 86%, var(--text-on-accent));
  }
</style>
