/**
 * WCAG 2.x contrast — relative luminance + contrast ratio + pass/fail level.
 */

export interface RGB255 {
  r: number;
  g: number;
  b: number;
}

function channelLuminance(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(rgb: RGB255): number {
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

/** WCAG contrast ratio between two colors, from 1:1 to 21:1. */
export function contrastRatio(a: RGB255, b: RGB255): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export type WcagLevel = 'AAA' | 'AA' | 'fail';

/**
 * WCAG 2.x pass/fail level. Thresholds: normal text needs 4.5 (AA) / 7 (AAA);
 * large text (≥18pt, or ≥14pt bold) needs 3 (AA) / 4.5 (AAA).
 */
export function wcagLevel(ratio: number, isLargeText: boolean): WcagLevel {
  const aa = isLargeText ? 3 : 4.5;
  const aaa = isLargeText ? 4.5 : 7;
  if (ratio >= aaa) return 'AAA';
  if (ratio >= aa) return 'AA';
  return 'fail';
}
