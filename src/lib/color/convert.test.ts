import { describe, it, expect } from 'vitest';
import {
  parseColor,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  rgbToHsb,
  hsbToRgb,
  rgbToOklch,
  oklchToRgb,
  rgbToLch,
  lchToRgb,
  rgbToP3,
  p3ToRgb,
} from './convert';

function closeTo(a: number, b: number, tol = 1.5) {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
}

function expectRgbClose(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, tol = 2) {
  closeTo(a.r, b.r, tol);
  closeTo(a.g, b.g, tol);
  closeTo(a.b, b.b, tol);
}

describe('parseColor — hex', () => {
  it('parses 6-digit hex with #', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('parses 6-digit hex without #', () => {
    expect(parseColor('00ff00')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
  });

  it('parses 3-digit shorthand hex', () => {
    expect(parseColor('#0f0')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
  });

  it('parses 8-digit hex with alpha', () => {
    expect(parseColor('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: expect.closeTo(0.5019, 3) });
  });

  it('parses 4-digit shorthand hex with alpha', () => {
    const c = parseColor('#f00f');
    expect(c).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('is case-insensitive', () => {
    expect(parseColor('#FF0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('returns null for invalid hex', () => {
    expect(parseColor('#gg0000')).toBeNull();
    expect(parseColor('#ff000')).toBeNull();
  });
});

describe('parseColor — rgb/rgba', () => {
  it('parses comma syntax', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('parses rgba with numeric alpha', () => {
    expect(parseColor('rgba(0, 128, 255, 0.5)')).toEqual({ r: 0, g: 128, b: 255, a: 0.5 });
  });

  it('parses space syntax with slash alpha percentage', () => {
    expect(parseColor('rgb(0 128 255 / 50%)')).toEqual({ r: 0, g: 128, b: 255, a: 0.5 });
  });

  it('returns null for out-of-range channel', () => {
    expect(parseColor('rgb(300, 0, 0)')).toBeNull();
  });
});

describe('parseColor — hsl/hsla', () => {
  it('parses pure red', () => {
    const c = parseColor('hsl(0, 100%, 50%)')!;
    expectRgbClose(c, { r: 255, g: 0, b: 0 });
  });

  it('parses with alpha', () => {
    const c = parseColor('hsla(120, 100%, 50%, 0.25)')!;
    expect(c.a).toBeCloseTo(0.25, 2);
    expectRgbClose(c, { r: 0, g: 255, b: 0 });
  });
});

describe('parseColor — hsb/hsv', () => {
  it('parses pure blue', () => {
    const c = parseColor('hsb(240, 100%, 100%)')!;
    expectRgbClose(c, { r: 0, g: 0, b: 255 });
  });

  it('accepts hsv alias', () => {
    const c = parseColor('hsv(240, 100%, 100%)')!;
    expectRgbClose(c, { r: 0, g: 0, b: 255 });
  });
});

describe('parseColor — oklch/lch/p3', () => {
  it('parses oklch white', () => {
    const c = parseColor('oklch(1 0 0)')!;
    expectRgbClose(c, { r: 255, g: 255, b: 255 }, 3);
  });

  it('parses lch black', () => {
    const c = parseColor('lch(0 0 0)')!;
    expectRgbClose(c, { r: 0, g: 0, b: 0 }, 3);
  });

  it('parses display-p3 white', () => {
    const c = parseColor('color(display-p3 1 1 1)')!;
    expectRgbClose(c, { r: 255, g: 255, b: 255 }, 3);
  });

  it('parses display-p3 percentage channels as fractions, not raw numbers', () => {
    const half = parseColor('color(display-p3 50% 0% 0%)')!;
    const full = parseColor('color(display-p3 100% 0% 0%)')!;
    expect(half).not.toEqual(full);
    expectRgbClose(half, p3ToRgb({ r: 0.5, g: 0, b: 0 }), 1);
  });
});

describe('parseColor — invalid input', () => {
  it('returns null for garbage', () => {
    expect(parseColor('not a color')).toBeNull();
    expect(parseColor('')).toBeNull();
  });
});

describe('rgbToHex', () => {
  it('renders lowercase by default', () => {
    expect(rgbToHex({ r: 255, g: 0, b: 0, a: 1 })).toBe('#ff0000');
  });

  it('renders uppercase when requested', () => {
    expect(rgbToHex({ r: 255, g: 0, b: 0, a: 1 }, true)).toBe('#FF0000');
  });

  it('pads single-digit channels', () => {
    expect(rgbToHex({ r: 1, g: 2, b: 3, a: 1 })).toBe('#010203');
  });
});

describe('HSL round-trip', () => {
  for (const [r, g, b] of [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 255],
    [0, 0, 0],
    [128, 64, 200],
  ] as const) {
    it(`round-trips rgb(${r},${g},${b})`, () => {
      const hsl = rgbToHsl({ r, g, b, a: 1 });
      const back = hslToRgb(hsl);
      expectRgbClose(back, { r, g, b });
    });
  }
});

describe('HSB round-trip', () => {
  for (const [r, g, b] of [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 255],
    [0, 0, 0],
    [30, 200, 90],
  ] as const) {
    it(`round-trips rgb(${r},${g},${b})`, () => {
      const hsb = rgbToHsb({ r, g, b, a: 1 });
      const back = hsbToRgb(hsb);
      expectRgbClose(back, { r, g, b });
    });
  }
});

describe('OKLCH round-trip', () => {
  for (const [r, g, b] of [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 255],
    [0, 0, 0],
    [100, 150, 200],
  ] as const) {
    it(`round-trips rgb(${r},${g},${b})`, () => {
      const oklch = rgbToOklch({ r, g, b, a: 1 });
      const back = oklchToRgb(oklch);
      expectRgbClose(back, { r, g, b }, 2);
    });
  }
});

describe('LCH round-trip', () => {
  for (const [r, g, b] of [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 255],
    [0, 0, 0],
    [100, 150, 200],
  ] as const) {
    it(`round-trips rgb(${r},${g},${b})`, () => {
      const lch = rgbToLch({ r, g, b, a: 1 });
      const back = lchToRgb(lch);
      expectRgbClose(back, { r, g, b }, 2);
    });
  }
});

describe('P3 round-trip', () => {
  for (const [r, g, b] of [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 255],
    [0, 0, 0],
    [100, 150, 200],
  ] as const) {
    it(`round-trips rgb(${r},${g},${b})`, () => {
      const p3 = rgbToP3({ r, g, b, a: 1 });
      const back = p3ToRgb(p3);
      expectRgbClose(back, { r, g, b }, 2);
    });
  }
});

describe('gamut clamping', () => {
  it('oklchToRgb clamps out-of-gamut chroma into 0..255', () => {
    const c = oklchToRgb({ l: 0.6, c: 0.4, h: 30 });
    for (const ch of [c.r, c.g, c.b]) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(255);
    }
  });

  it('alpha channel survives hslToRgb/hsbToRgb', () => {
    expect(hslToRgb({ h: 0, s: 100, l: 50 }, 0.4).a).toBe(0.4);
    expect(hsbToRgb({ h: 0, s: 100, b: 100 }, 0.4).a).toBe(0.4);
  });
});
