import { describe, it, expect } from 'vitest';
import { renderTrayMenu, TRAY_ITEM_ID, PICK_COLOR_ITEM_ID } from './trayMenu';
import type { HistoryEntry } from './types';

function entry(id: string, hex: string, favorite = false): HistoryEntry {
  return { id, hex, r: 0, g: 0, b: 0, timestamp: 0, favorite };
}

describe('renderTrayMenu', () => {
  it('returns null when trayIconEnabled is false, regardless of state', () => {
    const item = renderTrayMenu(
      { swatchIconPath: 'data:image/png;base64,X', recent: [entry('a', '#ff0000')] },
      { trayIconEnabled: false },
    );
    expect(item).toBeNull();
  });

  it('falls back to an emoji glyph when no color has ever been picked', () => {
    const item = renderTrayMenu({ swatchIconPath: null, recent: [] }, { trayIconEnabled: true });
    expect(item).not.toBeNull();
    expect(item!.icon).toBe('🎨');
    expect(item!.iconPath).toBeUndefined();
  });

  it('uses the swatch data URI as iconPath once a color has been picked', () => {
    const item = renderTrayMenu(
      { swatchIconPath: 'data:image/png;base64,ABC', recent: [entry('a', '#ff0000')] },
      { trayIconEnabled: true },
    );
    expect(item!.iconPath).toBe('data:image/png;base64,ABC');
  });

  it('always includes a top-level id and a "Pick Color" submenu entry', () => {
    const item = renderTrayMenu({ swatchIconPath: null, recent: [] }, { trayIconEnabled: true });
    expect(item!.id).toBe(TRAY_ITEM_ID);
    const pick = item!.submenu?.find((i) => i.id === PICK_COLOR_ITEM_ID);
    expect(pick).toBeDefined();
    expect(pick!.text).toBe('Pick Color');
  });

  it('lists recent colors as disabled preview rows, not clickable', () => {
    const item = renderTrayMenu(
      { swatchIconPath: null, recent: [entry('a', '#ff0000'), entry('b', '#00ff00')] },
      { trayIconEnabled: true },
    );
    const rows = item!.submenu?.filter((i) => i.id?.startsWith('recent-')) ?? [];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.enabled).toBe(false);
      expect(row.onClick).toBeUndefined();
    }
    expect(rows[0].text).toContain('#ff0000');
  });

  it('omits the recent-colors section entirely when history is empty', () => {
    const item = renderTrayMenu({ swatchIconPath: null, recent: [] }, { trayIconEnabled: true });
    const rows = item!.submenu?.filter((i) => i.id?.startsWith('recent-')) ?? [];
    expect(rows).toHaveLength(0);
  });
});
