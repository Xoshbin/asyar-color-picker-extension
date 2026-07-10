import type { IStatusBarItem } from 'asyar-sdk/contracts';
import type { HistoryEntry } from './types';

export const TRAY_ITEM_ID = 'color-picker-tray';
export const PICK_COLOR_ITEM_ID = 'pick-color';

export interface TrayState {
  /** Pre-rendered swatch PNG data URI, or null before any color is picked. */
  swatchIconPath: string | null;
  /** Already capped to the number of rows to show. */
  recent: HistoryEntry[];
}

export interface TrayPrefs {
  trayIconEnabled: boolean;
}

/**
 * Pure render function — (state, prefs) => tray tree. No side effects, no
 * mocking needed. "Recent colors" rows are read-only previews: the worker
 * has no clipboard access, so they cannot support click-to-copy.
 */
export function renderTrayMenu(state: TrayState, prefs: TrayPrefs): IStatusBarItem | null {
  if (!prefs.trayIconEnabled) return null;

  const submenu: IStatusBarItem[] = [{ id: PICK_COLOR_ITEM_ID, text: 'Pick Color' }];

  if (state.recent.length > 0) {
    submenu.push({ separator: true });
    submenu.push({ id: 'header-recent', text: 'Recent Colors', enabled: false });
    for (const entry of state.recent) {
      submenu.push({ id: `recent-${entry.id}`, text: entry.hex, enabled: false });
    }
  }

  return {
    id: TRAY_ITEM_ID,
    icon: state.swatchIconPath ? undefined : '🎨',
    iconPath: state.swatchIconPath ?? undefined,
    text: state.recent[0]?.hex ?? 'Color Picker',
    submenu,
  };
}
