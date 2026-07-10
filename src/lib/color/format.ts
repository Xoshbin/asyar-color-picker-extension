import {
  rgbToHex,
  rgbToHsl,
  rgbToHsb,
  rgbToOklch,
  rgbToLch,
  rgbToP3,
  type RGBColor,
} from './convert';

export type ColorFormat = 'hex' | 'rgb' | 'hsl' | 'hsb' | 'oklch' | 'lch' | 'p3';

const KNOWN_FORMATS: readonly ColorFormat[] = ['hex', 'rgb', 'hsl', 'hsb', 'oklch', 'lch', 'p3'];

/** Safely narrows a preference value to a ColorFormat, defaulting to hex. */
export function resolveFormatPreference(value: unknown): ColorFormat {
  return (KNOWN_FORMATS as readonly unknown[]).includes(value) ? (value as ColorFormat) : 'hex';
}

export interface FormatOptions {
  uppercaseHex?: boolean;
}

function round(n: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

/** Render a parsed color as a string in the requested format. */
export function formatColor(color: RGBColor, format: ColorFormat, opts: FormatOptions): string {
  const alphaSuffix = color.a < 1 ? `, ${round(color.a, 2)}` : '';

  switch (format) {
    case 'hex': {
      const base = rgbToHex(color, Boolean(opts.uppercaseHex));
      if (color.a >= 1) return base;
      const alphaHex = Math.max(0, Math.min(255, Math.round(color.a * 255)))
        .toString(16)
        .padStart(2, '0');
      const out = `${base}${alphaHex}`;
      return opts.uppercaseHex ? out.toUpperCase() : out;
    }
    case 'rgb': {
      const body = `${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}${alphaSuffix}`;
      return color.a < 1 ? `rgba(${body})` : `rgb(${body})`;
    }
    case 'hsl': {
      const { h, s, l } = rgbToHsl(color);
      const body = `${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%${alphaSuffix}`;
      return color.a < 1 ? `hsla(${body})` : `hsl(${body})`;
    }
    // hsb has no CSS "hsba" counterpart, so alpha rides the same slash
    // syntax as the CSS Color 4 functional formats below.
    case 'hsb': {
      const { h, s, b } = rgbToHsb(color);
      const body = `${Math.round(h)}, ${Math.round(s)}%, ${Math.round(b)}%`;
      return color.a < 1 ? `hsb(${body} / ${round(color.a, 2)})` : `hsb(${body})`;
    }
    case 'oklch': {
      const { l, c, h } = rgbToOklch(color);
      const body = `${round(l, 3)} ${round(c, 3)} ${round(h, 1)}`;
      return color.a < 1 ? `oklch(${body} / ${round(color.a, 2)})` : `oklch(${body})`;
    }
    case 'lch': {
      const { l, c, h } = rgbToLch(color);
      const body = `${round(l, 1)} ${round(c, 1)} ${round(h, 1)}`;
      return color.a < 1 ? `lch(${body} / ${round(color.a, 2)})` : `lch(${body})`;
    }
    case 'p3': {
      const { r, g, b } = rgbToP3(color);
      const body = `${round(r, 3)} ${round(g, 3)} ${round(b, 3)}`;
      return color.a < 1
        ? `color(display-p3 ${body} / ${round(color.a, 2)})`
        : `color(display-p3 ${body})`;
    }
    default: {
      const _exhaustive: never = format;
      return _exhaustive;
    }
  }
}
