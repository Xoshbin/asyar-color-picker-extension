<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type {
    ExtensionContext,
    IScreenService,
    IStorageService,
    IStatusBarService,
    IClipboardHistoryService,
    IFeedbackService,
  } from 'asyar-sdk/view';
  import { runPickFlow } from '../lib/pickFlow';
  import { resolveFormatPreference } from '../lib/color/format';
  import { formatColor } from '../lib/color/format';
  import { syncWorkerPreferences } from '../lib/preferencesSync';

  let { context } = $props<{ context: ExtensionContext }>();

  let errorMessage = $state<string | null>(null);
  let unsyncPrefs: (() => void) | null = null;

  onMount(() => {
    unsyncPrefs = syncWorkerPreferences(context);

    void (async () => {
      const feedback = context.getService('feedback') as IFeedbackService;
      try {
        await runPickFlow({
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
        });
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err);
        await feedback.showHUD(`Color Picker error: ${errorMessage}`);
      }
    })();
  });

  onDestroy(() => {
    unsyncPrefs?.();
  });
</script>

<div class="wrap">
  {#if errorMessage}
    <p class="error">{errorMessage}</p>
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
    color: var(--text-secondary);
    font-family: var(--font-ui);
    font-size: var(--font-size-base);
  }

  .error {
    color: var(--accent-danger);
  }
</style>
