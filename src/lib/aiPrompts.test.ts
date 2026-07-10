import { describe, it, expect } from 'vitest';
import { buildNameColorQuery, buildPaletteFromColorQuery } from './aiPrompts';

describe('buildNameColorQuery', () => {
  it('includes the hex value and asks for a short name', () => {
    const query = buildNameColorQuery('#ff0000');
    expect(query).toContain('#ff0000');
    expect(query.toLowerCase()).toContain('name');
  });
});

describe('buildPaletteFromColorQuery', () => {
  it('includes the hex value and asks for a palette', () => {
    const query = buildPaletteFromColorQuery('#00ff00');
    expect(query).toContain('#00ff00');
    expect(query.toLowerCase()).toContain('palette');
  });
});
