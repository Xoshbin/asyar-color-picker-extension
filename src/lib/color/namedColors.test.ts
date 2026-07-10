import { describe, it, expect } from 'vitest';
import { CSS_NAMED_COLORS, nearestNamedColor } from './namedColors';

describe('CSS_NAMED_COLORS', () => {
  it('includes well-known keywords with correct RGB', () => {
    expect(CSS_NAMED_COLORS.red).toEqual({ r: 255, g: 0, b: 0 });
    expect(CSS_NAMED_COLORS.black).toEqual({ r: 0, g: 0, b: 0 });
    expect(CSS_NAMED_COLORS.white).toEqual({ r: 255, g: 255, b: 255 });
    expect(CSS_NAMED_COLORS.rebeccapurple).toEqual({ r: 102, g: 51, b: 153 });
  });

  it('has a large-ish catalog (CSS Level 4 named colors)', () => {
    expect(Object.keys(CSS_NAMED_COLORS).length).toBeGreaterThan(100);
  });
});

describe('nearestNamedColor', () => {
  it('finds an exact match with zero distance', () => {
    const result = nearestNamedColor({ r: 255, g: 0, b: 0 });
    expect(result.name).toBe('red');
    expect(result.distance).toBe(0);
  });

  it('finds the closest match for a near-miss color', () => {
    const result = nearestNamedColor({ r: 250, g: 5, b: 5 });
    expect(result.name).toBe('red');
    expect(result.distance).toBeGreaterThan(0);
  });

  it('picks black over white for a very dark gray', () => {
    const result = nearestNamedColor({ r: 10, g: 10, b: 10 });
    expect(result.name).toBe('black');
  });
});
