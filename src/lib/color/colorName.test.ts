import { describe, it, expect } from 'vitest';
import { displayColorName } from './colorName';

describe('displayColorName', () => {
  it('splits concatenated keywords into words', () => {
    expect(displayColorName('royalblue')).toBe('Royal Blue');
    expect(displayColorName('lightgoldenrodyellow')).toBe('Light Goldenrod Yellow');
    expect(displayColorName('rebeccapurple')).toBe('Rebecca Purple');
    expect(displayColorName('lightslategrey')).toBe('Light Slate Grey');
  });

  it('keeps single-word keywords whole', () => {
    expect(displayColorName('goldenrod')).toBe('Goldenrod');
    expect(displayColorName('gainsboro')).toBe('Gainsboro');
    expect(displayColorName('plum')).toBe('Plum');
  });

  it('falls back to a capitalised keyword it cannot fully split', () => {
    expect(displayColorName('notacolour')).toBe('Notacolour');
  });

  it('tolerates empty input', () => {
    expect(displayColorName('')).toBe('');
    expect(displayColorName('   ')).toBe('');
  });
});
