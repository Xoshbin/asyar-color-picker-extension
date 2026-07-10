/**
 * Pure color-space conversions. No platform calls, no DOM. All conversions
 * pivot through sRGB (0-255 channels, 0-1 alpha) as the canonical shape.
 */

export interface RGBColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface HSB {
  h: number;
  s: number;
  b: number;
}

export interface LCH {
  l: number;
  c: number;
  h: number;
}

export interface OKLCH {
  l: number;
  c: number;
  h: number;
}

export interface P3Color {
  r: number;
  g: number;
  b: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function clamp255(n: number): number {
  return clamp(Math.round(n), 0, 255);
}

// ─── hex ────────────────────────────────────────────────────────────────

export function rgbToHex(rgb: RGBColor, uppercase = false): string {
  const hex = [rgb.r, rgb.g, rgb.b]
    .map((c) => clamp255(c).toString(16).padStart(2, '0'))
    .join('');
  const out = `#${hex}`;
  return uppercase ? out.toUpperCase() : out;
}

function parseHex(input: string): RGBColor | null {
  const s = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(s)) return null;

  const expand = (ch: string) => ch + ch;

  if (s.length === 3) {
    const [r, g, b] = s.split('').map(expand);
    return { r: parseInt(r, 16), g: parseInt(g, 16), b: parseInt(b, 16), a: 1 };
  }
  if (s.length === 4) {
    const [r, g, b, a] = s.split('').map(expand);
    return {
      r: parseInt(r, 16),
      g: parseInt(g, 16),
      b: parseInt(b, 16),
      a: parseInt(a, 16) / 255,
    };
  }
  if (s.length === 6) {
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
      a: 1,
    };
  }
  if (s.length === 8) {
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
      a: parseInt(s.slice(6, 8), 16) / 255,
    };
  }
  return null;
}

// ─── hsl ────────────────────────────────────────────────────────────────

export function rgbToHsl(rgb: RGBColor): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  h *= 60;
  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb(hsl: HSL, a = 1): RGBColor {
  const h = ((hsl.h % 360) + 360) % 360;
  const s = clamp(hsl.s, 0, 100) / 100;
  const l = clamp(hsl.l, 0, 100) / 100;

  if (s === 0) {
    const v = clamp255(l * 255);
    return { r: v, g: v, b: v, a };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const hk = h / 360;
  return {
    r: clamp255(hue2rgb(hk + 1 / 3) * 255),
    g: clamp255(hue2rgb(hk) * 255),
    b: clamp255(hue2rgb(hk - 1 / 3) * 255),
    a,
  };
}

// ─── hsb/hsv ────────────────────────────────────────────────────────────

export function rgbToHsb(rgb: RGBColor): HSB {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s: s * 100, b: max * 100 };
}

export function hsbToRgb(hsb: HSB, a = 1): RGBColor {
  const h = ((hsb.h % 360) + 360) % 360;
  const s = clamp(hsb.s, 0, 100) / 100;
  const v = clamp(hsb.b, 0, 100) / 100;

  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];

  return {
    r: clamp255((rp + m) * 255),
    g: clamp255((gp + m) * 255),
    b: clamp255((bp + m) * 255),
    a,
  };
}

// ─── sRGB <-> linear <-> XYZ (D65) ──────────────────────────────────────

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return clamp(v, 0, 1);
}

function rgbToLinear(rgb: RGBColor): [number, number, number] {
  return [srgbToLinear(rgb.r / 255), srgbToLinear(rgb.g / 255), srgbToLinear(rgb.b / 255)];
}

function linearToRgb([r, g, b]: [number, number, number], a = 1): RGBColor {
  return {
    r: clamp255(linearToSrgb(r) * 255),
    g: clamp255(linearToSrgb(g) * 255),
    b: clamp255(linearToSrgb(b) * 255),
    a,
  };
}

function linearToXyz([r, g, b]: [number, number, number]): [number, number, number] {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}

function xyzToLinear([x, y, z]: [number, number, number]): [number, number, number] {
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}

// D65 reference white
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;

function labF(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta ** 2) + 4 / 29;
}

function labFInv(t: number): number {
  const delta = 6 / 29;
  return t > delta ? t ** 3 : 3 * delta ** 2 * (t - 4 / 29);
}

function xyzToLab([x, y, z]: [number, number, number]): [number, number, number] {
  const fx = labF(x / XN);
  const fy = labF(y / YN);
  const fz = labF(z / ZN);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToXyz([l, a, b]: [number, number, number]): [number, number, number] {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  return [XN * labFInv(fx), YN * labFInv(fy), ZN * labFInv(fz)];
}

// ─── LCH ────────────────────────────────────────────────────────────────

export function rgbToLch(rgb: RGBColor): LCH {
  const [l, a, b] = xyzToLab(linearToXyz(rgbToLinear(rgb)));
  const c = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l, c, h };
}

export function lchToRgb(lch: LCH, a = 1): RGBColor {
  const hRad = (lch.h * Math.PI) / 180;
  const labA = lch.c * Math.cos(hRad);
  const labB = lch.c * Math.sin(hRad);
  const xyz = labToXyz([lch.l, labA, labB]);
  return linearToRgb(xyzToLinear(xyz), a);
}

// ─── OKLCH ──────────────────────────────────────────────────────────────

function linearToOklab([r, g, b]: [number, number, number]): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

function oklabToLinear([L, a, b]: [number, number, number]): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function rgbToOklch(rgb: RGBColor): OKLCH {
  const [L, a, b] = linearToOklab(rgbToLinear(rgb));
  const c = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

export function oklchToRgb(oklch: OKLCH, a = 1): RGBColor {
  const hRad = (oklch.h * Math.PI) / 180;
  const labA = oklch.c * Math.cos(hRad);
  const labB = oklch.c * Math.sin(hRad);
  const linear = oklabToLinear([oklch.l, labA, labB]);
  // Out-of-gamut OKLCH values (e.g. very high chroma) map outside 0..1
  // linear-light — clamp is enough since callers only need a displayable
  // sRGB approximation, not gamut mapping.
  const clamped: [number, number, number] = [
    clamp(linear[0], 0, 1),
    clamp(linear[1], 0, 1),
    clamp(linear[2], 0, 1),
  ];
  return linearToRgb(clamped, a);
}

// ─── Display P3 ─────────────────────────────────────────────────────────
// P3 shares sRGB's transfer function; only the primaries (matrix) differ.

function linearSrgbToLinearP3([r, g, b]: [number, number, number]): [number, number, number] {
  return [
    0.8224621 * r + 0.177538 * g + 0.0 * b,
    0.0331941 * r + 0.9668058 * g + 0.0 * b,
    0.0170827 * r + 0.0723974 * g + 0.9105199 * b,
  ];
}

function linearP3ToLinearSrgb([r, g, b]: [number, number, number]): [number, number, number] {
  return [
    1.2249401 * r - 0.2249404 * g + 0.0 * b,
    -0.0420569 * r + 1.0420571 * g + 0.0 * b,
    -0.0196376 * r - 0.0786361 * g + 1.0982735 * b,
  ];
}

export function rgbToP3(rgb: RGBColor): P3Color {
  const [r, g, b] = linearSrgbToLinearP3(rgbToLinear(rgb));
  return {
    r: linearToSrgb(r),
    g: linearToSrgb(g),
    b: linearToSrgb(b),
  };
}

export function p3ToRgb(p3: P3Color, a = 1): RGBColor {
  const linear: [number, number, number] = [
    srgbToLinear(clamp(p3.r, 0, 1)),
    srgbToLinear(clamp(p3.g, 0, 1)),
    srgbToLinear(clamp(p3.b, 0, 1)),
  ];
  return linearToRgb(linearP3ToLinearSrgb(linear), a);
}

// ─── parsing ────────────────────────────────────────────────────────────

function parsePercentOrNumber(token: string, scale = 1): number {
  const t = token.trim();
  if (t.endsWith('%')) return (parseFloat(t) / 100) * scale;
  return parseFloat(t);
}

function splitArgs(inner: string): string[] {
  // Accept both comma and space-separated syntax, with an optional
  // `/ alpha` suffix. Splitting on `/` first isolates the alpha term.
  const [main, alphaPart] = inner.split('/');
  const parts = main
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (alphaPart !== undefined) parts.push(`/${alphaPart.trim()}`);
  return parts;
}

function parseFunctional(input: string): { name: string; args: string[] } | null {
  const m = input.trim().match(/^([a-zA-Z][a-zA-Z0-9-]*)\(([^)]*)\)$/);
  if (!m) return null;
  return { name: m[1].toLowerCase(), args: splitArgs(m[2]) };
}

export function parseColor(input: string): RGBColor | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('#') || /^[0-9a-fA-F]{3,8}$/.test(trimmed)) {
    return parseHex(trimmed);
  }

  const fn = parseFunctional(trimmed);
  if (!fn) return null;

  const alphaArg = fn.args.find((a) => a.startsWith('/'));
  const positional = fn.args.filter((a) => !a.startsWith('/'));
  const alpha = alphaArg ? clamp(parsePercentOrNumber(alphaArg.slice(1), 1), 0, 1) : undefined;

  switch (fn.name) {
    case 'rgb':
    case 'rgba': {
      if (positional.length < 3) return null;
      const r = parsePercentOrNumber(positional[0], 255);
      const g = parsePercentOrNumber(positional[1], 255);
      const b = parsePercentOrNumber(positional[2], 255);
      const a = alpha ?? (positional[3] !== undefined ? parsePercentOrNumber(positional[3], 1) : 1);
      if ([r, g, b].some((v) => Number.isNaN(v) || v < 0 || v > 255)) return null;
      return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: clamp(a, 0, 1) };
    }
    case 'hsl':
    case 'hsla': {
      if (positional.length < 3) return null;
      const h = parseFloat(positional[0]);
      const s = parsePercentOrNumber(positional[1], 100);
      const l = parsePercentOrNumber(positional[2], 100);
      const a = alpha ?? (positional[3] !== undefined ? parsePercentOrNumber(positional[3], 1) : 1);
      if ([h, s, l].some(Number.isNaN)) return null;
      return hslToRgb({ h, s, l }, clamp(a, 0, 1));
    }
    case 'hsb':
    case 'hsv': {
      if (positional.length < 3) return null;
      const h = parseFloat(positional[0]);
      const s = parsePercentOrNumber(positional[1], 100);
      const v = parsePercentOrNumber(positional[2], 100);
      const a = alpha ?? (positional[3] !== undefined ? parsePercentOrNumber(positional[3], 1) : 1);
      if ([h, s, v].some(Number.isNaN)) return null;
      return hsbToRgb({ h, s, b: v }, clamp(a, 0, 1));
    }
    case 'oklch': {
      if (positional.length < 3) return null;
      const l = parsePercentOrNumber(positional[0], 1);
      const c = parseFloat(positional[1]);
      const h = parseFloat(positional[2]);
      const a = alpha ?? 1;
      if ([l, c, h].some(Number.isNaN)) return null;
      return oklchToRgb({ l, c, h }, clamp(a, 0, 1));
    }
    case 'lch': {
      if (positional.length < 3) return null;
      const l = parseFloat(positional[0]);
      const c = parseFloat(positional[1]);
      const h = parseFloat(positional[2]);
      const a = alpha ?? 1;
      if ([l, c, h].some(Number.isNaN)) return null;
      return lchToRgb({ l, c, h }, clamp(a, 0, 1));
    }
    case 'color': {
      const [space, ...rest] = positional;
      if (space?.toLowerCase() !== 'display-p3' || rest.length < 3) return null;
      // P3 channels are 0-1 range, same scale as oklch's L — 100% means 1, not 100.
      const r = parsePercentOrNumber(rest[0], 1);
      const g = parsePercentOrNumber(rest[1], 1);
      const b = parsePercentOrNumber(rest[2], 1);
      const a = alpha ?? 1;
      if ([r, g, b].some(Number.isNaN)) return null;
      return p3ToRgb({ r, g, b }, clamp(a, 0, 1));
    }
    default:
      return null;
  }
}
