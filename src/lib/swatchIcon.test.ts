import { describe, it, expect, vi } from 'vitest';
import { createSwatchIconDataUri, type CanvasLike } from './swatchIcon';

function fakeCanvas(dataUrl = 'data:image/png;base64,FAKE'): {
  canvas: CanvasLike;
  ctx: { fillStyle: string; fillRect: ReturnType<typeof vi.fn> };
} {
  const ctx = { fillStyle: '', fillRect: vi.fn() };
  const canvas: CanvasLike = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx) as any,
    toDataURL: vi.fn(() => dataUrl),
  };
  return { canvas, ctx };
}

describe('createSwatchIconDataUri', () => {
  it('sizes the canvas and fills it with the given hex color', () => {
    const { canvas, ctx } = fakeCanvas();
    createSwatchIconDataUri('#ff0000', () => canvas);
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBe(canvas.width);
    expect(ctx.fillStyle).toBe('#ff0000');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, canvas.width, canvas.height);
  });

  it('returns the data URI produced by toDataURL("image/png")', () => {
    const { canvas } = fakeCanvas('data:image/png;base64,ABCDEF');
    const result = createSwatchIconDataUri('#00ff00', () => canvas);
    expect(result).toBe('data:image/png;base64,ABCDEF');
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('returns null when the canvas has no 2d context', () => {
    const canvas: CanvasLike = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => null) as any,
      toDataURL: vi.fn(() => 'data:image/png;base64,X'),
    };
    expect(createSwatchIconDataUri('#123456', () => canvas)).toBeNull();
  });
});
