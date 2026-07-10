import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import manifest from '../manifest.json';

const ROOT = join(__dirname, '..');

/**
 * Unlike the emoji extension (logic lives directly in worker.ts/DefaultView),
 * this extension pushes almost everything into src/lib/ for testability, so
 * the permission scan must cover worker.ts + view.ts + lib/*.ts + views/*.svelte,
 * not just the two entry files.
 */
function readAllSource(): string {
  const files: string[] = [
    join(ROOT, 'src/worker.ts'),
    join(ROOT, 'src/view.ts'),
  ];
  for (const dir of ['src/lib', 'src/lib/color', 'src/views']) {
    const full = join(ROOT, dir);
    for (const name of readdirSync(full)) {
      if (name.endsWith('.test.ts')) continue;
      if (!name.endsWith('.ts') && !name.endsWith('.svelte')) continue;
      files.push(join(full, name));
    }
  }
  return files.map((f) => readFileSync(f, 'utf8')).join('\n');
}

const source = readAllSource();
const declared = new Set<string>(manifest.permissions);

// Qualified (not bare) so generic names like `.get(`/`.set(`/`.send(` don't
// false-positive against unrelated Map/object calls elsewhere in the scan.
const PERMISSION_FOR_API: Record<string, string> = {
  '\\.pickColor\\(': 'screen:pick-color',
  '\\.writeToClipboard\\(': 'clipboard:write',
  'storage\\.get\\(|storage\\.getAll\\(': 'storage:read',
  'storage\\.set\\(|storage\\.delete\\(': 'storage:write',
  'preferences\\.refresh\\??\\.?\\(': 'preferences:read',
  'notifications\\.send\\(': 'notifications:send',
  'interop\\.launchCommand\\(': 'extension:invoke',
};

describe('manifest permissions contract', () => {
  it('every API call pattern found in source has its permission declared', () => {
    for (const [pattern, perm] of Object.entries(PERMISSION_FOR_API)) {
      const re = new RegExp(pattern);
      if (re.test(source)) {
        expect(declared, `source matches /${pattern}/ but manifest lacks "${perm}"`).toContain(
          perm,
        );
      }
    }
  });

  it('every declared permission corresponds to at least one API call pattern', () => {
    for (const perm of declared) {
      const patternsForPerm = Object.entries(PERMISSION_FOR_API)
        .filter(([, p]) => p === perm)
        .map(([pattern]) => pattern);
      const usedAny = patternsForPerm.some((pattern) => new RegExp(pattern).test(source));
      expect(
        usedAny,
        `manifest declares "${perm}" but no source pattern among [${patternsForPerm.join(', ')}] matched`,
      ).toBe(true);
    }
  });

  it('declares exactly the commands implemented by view.ts', () => {
    const ids = manifest.commands.map((c) => c.id).sort();
    expect(ids).toEqual(['color-history', 'convert-color', 'pick-color']);
  });

  it('every command is mode "view" with a matching component', () => {
    for (const cmd of manifest.commands) {
      expect(cmd.mode).toBe('view');
      expect(cmd.component).toBeTruthy();
    }
  });

  it('does not declare a manifest `arguments` array on any command', () => {
    // A `mode: "view"` command's arguments are silently dropped — the host's
    // navigateToView(viewPath) takes no args parameter and ExtensionLoader's
    // view-command handler never forwards `args`. Declaring `arguments` here
    // would render a chip-row UI that submits into the void.
    for (const cmd of manifest.commands) {
      expect((cmd as { arguments?: unknown }).arguments).toBeUndefined();
    }
  });

  it('trayIconEnabled preference defaults to false', () => {
    const pref = manifest.preferences.find((p) => p.name === 'trayIconEnabled');
    expect(pref?.default).toBe(false);
  });

  it('preference types are valid PreferenceType values, never "text"', () => {
    const valid = new Set([
      'textfield',
      'password',
      'number',
      'checkbox',
      'dropdown',
      'appPicker',
      'file',
      'directory',
    ]);
    for (const pref of manifest.preferences) {
      expect(valid.has(pref.type)).toBe(true);
    }
  });
});
