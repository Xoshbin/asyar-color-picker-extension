import { describe, it, expect } from 'vitest';
import { relativeLuminance, contrastRatio, wcagLevel } from './contrast';

describe('relativeLuminance', () => {
  it('is 1 for white', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 3);
  });

  it('is 0 for black', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 3);
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white (the maximum)', () => {
    const ratio = contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
    expect(ratio).toBeCloseTo(21, 1);
  });

  it('is 1:1 for identical colors', () => {
    const ratio = contrastRatio({ r: 100, g: 150, b: 200 }, { r: 100, g: 150, b: 200 });
    expect(ratio).toBeCloseTo(1, 3);
  });

  it('is symmetric regardless of argument order', () => {
    const a = contrastRatio({ r: 20, g: 20, b: 20 }, { r: 240, g: 240, b: 240 });
    const b = contrastRatio({ r: 240, g: 240, b: 240 }, { r: 20, g: 20, b: 20 });
    expect(a).toBeCloseTo(b, 6);
  });

  it('matches the well-known WebAIM reference gray #767676 on white (~4.54:1)', () => {
    const ratio = contrastRatio({ r: 0x76, g: 0x76, b: 0x76 }, { r: 255, g: 255, b: 255 });
    expect(ratio).toBeCloseTo(4.54, 1);
  });
});

describe('wcagLevel', () => {
  it('classifies 21:1 as AAA for normal text', () => {
    expect(wcagLevel(21, false)).toBe('AAA');
  });

  it('classifies the #767676 gray-on-white ratio as AA-pass / AAA-fail for normal text', () => {
    // 4.54:1 clears the 4.5:1 AA-normal threshold but not the 7:1 AAA-normal threshold.
    expect(wcagLevel(4.54, false)).toBe('AA');
  });

  it('classifies below 3:1 as fail even for large text', () => {
    expect(wcagLevel(2.5, true)).toBe('fail');
  });

  it('classifies 3:1-4.5:1 as AA for large text but not normal text', () => {
    expect(wcagLevel(3.5, true)).toBe('AA');
    expect(wcagLevel(3.5, false)).toBe('fail');
  });

  it('classifies 4.5:1-7:1 as AAA for large text', () => {
    expect(wcagLevel(5, true)).toBe('AAA');
  });
});
