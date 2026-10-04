/** Minimal shape of the 2D canvas rendering context this module needs. */
export interface CanvasContextLike {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/** Minimal canvas shape — dependency-injected so this stays DOM-free in tests. */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasContextLike | null;
  toDataURL?(type: string): string;
  convertToBlob?(options: { type: string }): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
}

const SWATCH_SIZE = 32;

/**
 * Renders a solid-color square PNG and returns it as a `data:image/png`
 * URI, for use as a live tray-icon swatch of the last-picked color.
 */
export async function createSwatchIconDataUri(
  hex: string,
  createCanvas: () => CanvasLike,
): Promise<string | null> {
  const canvas = createCanvas();
  canvas.width = SWATCH_SIZE;
  canvas.height = SWATCH_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (canvas.convertToBlob) {
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
  }
  return canvas.toDataURL?.('image/png') ?? null;
}
