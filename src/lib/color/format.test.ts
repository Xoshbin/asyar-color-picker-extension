import { describe, it, expect } from 'vitest';
import { formatColor, resolveFormatPreference, type ColorFormat } from './format';
import type { RGBColor } from './convert';

const red: RGBColor = { r: 255, g: 0, b: 0, a: 1 };
const translucentBlue: RGBColor = { r: 0, g: 0, b: 255, a: 0.5 };

describe('formatColor — hex', () => {
  it('renders lowercase hex by default', () => {
    expect(formatColor(red, 'hex', { uppercaseHex: false })).toBe('#ff0000');
  });

  it('renders uppercase hex when requested', () => {
    expect(formatColor(red, 'hex', { uppercaseHex: true })).toBe('#FF0000');
  });
});

describe('formatColor — rgb', () => {
  it('renders rgb() for opaque colors', () => {
    expect(formatColor(red, 'rgb', {})).toBe('rgb(255, 0, 0)');
  });

  it('renders rgba() for translucent colors', () => {
    expect(formatColor(translucentBlue, 'rgb', {})).toBe('rgba(0, 0, 255, 0.5)');
  });
});

describe('formatColor — hsl/hsb', () => {
  it('renders hsl()', () => {
    expect(formatColor(red, 'hsl', {})).toBe('hsl(0, 100%, 50%)');
  });

  it('renders hsb()', () => {
    expect(formatColor(red, 'hsb', {})).toBe('hsb(0, 100%, 100%)');
  });
});

describe('formatColor — oklch/lch/p3', () => {
  it('renders oklch() with 3-4 significant digits', () => {
    const out = formatColor(red, 'oklch', {});
    expect(out).toMatch(/^oklch\(0?\.\d+ 0?\.\d+ \d+(\.\d+)?\)$/);
  });

  it('renders lch()', () => {
    const out = formatColor(red, 'lch', {});
    expect(out).toMatch(/^lch\(\d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)?\)$/);
  });

  it('renders display-p3', () => {
    const out = formatColor(red, 'p3', {});
    expect(out).toMatch(/^color\(display-p3 [\d.]+ [\d.]+ [\d.]+\)$/);
  });
});

describe('formatColor — alpha across every format', () => {
  const translucentRed: RGBColor = { r: 255, g: 0, b: 0, a: 0.5 };
  const opaqueRed: RGBColor = { r: 255, g: 0, b: 0, a: 1 };

  it('hex includes an 8-digit alpha suffix', () => {
    expect(formatColor(translucentRed, 'hex', {})).toBe('#ff000080');
  });

  it('hex alpha suffix respects uppercase', () => {
    expect(formatColor(translucentRed, 'hex', { uppercaseHex: true })).toBe('#FF000080');
  });

  it('hsb includes a slash-syntax alpha suffix', () => {
    expect(formatColor(translucentRed, 'hsb', {})).toBe('hsb(0, 100%, 100% / 0.5)');
  });

  it('oklch includes a slash-syntax alpha suffix', () => {
    const out = formatColor(translucentRed, 'oklch', {});
    expect(out).toMatch(/^oklch\(0?\.\d+ 0?\.\d+ \d+(\.\d+)? \/ 0\.5\)$/);
  });

  it('lch includes a slash-syntax alpha suffix', () => {
    const out = formatColor(translucentRed, 'lch', {});
    expect(out).toMatch(/^lch\(\d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)? \/ 0\.5\)$/);
  });

  it('p3 includes a slash-syntax alpha suffix', () => {
    const out = formatColor(translucentRed, 'p3', {});
    expect(out).toMatch(/^color\(display-p3 [\d.]+ [\d.]+ [\d.]+ \/ 0\.5\)$/);
  });

  it('every format omits the alpha suffix for opaque colors', () => {
    expect(formatColor(opaqueRed, 'hex', {})).not.toContain('/');
    expect(formatColor(opaqueRed, 'hex', {}).length).toBe(7);
    expect(formatColor(opaqueRed, 'hsb', {})).not.toContain('/');
    expect(formatColor(opaqueRed, 'oklch', {})).not.toContain('/');
    expect(formatColor(opaqueRed, 'lch', {})).not.toContain('/');
    expect(formatColor(opaqueRed, 'p3', {})).not.toContain('/');
  });
});

describe('resolveFormatPreference', () => {
  it('accepts every known format value', () => {
    for (const f of ['hex', 'rgb', 'hsl', 'hsb', 'oklch', 'lch', 'p3']) {
      expect(resolveFormatPreference(f)).toBe(f);
    }
  });

  it('falls back to hex for unknown, missing, or non-string values', () => {
    expect(resolveFormatPreference('not-a-format')).toBe('hex');
    expect(resolveFormatPreference(undefined)).toBe('hex');
    expect(resolveFormatPreference(42)).toBe('hex');
  });
});

describe('formatColor — every format is handled', () => {
  const formats: ColorFormat[] = ['hex', 'rgb', 'hsl', 'hsb', 'oklch', 'lch', 'p3'];
  for (const f of formats) {
    it(`does not throw for format "${f}"`, () => {
      expect(() => formatColor(red, f, {})).not.toThrow();
    });
  }
});
