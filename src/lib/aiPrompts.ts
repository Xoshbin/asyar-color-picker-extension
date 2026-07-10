/**
 * Plain natural-language queries handed to a full agent thread (via
 * `interop.launchCommand('agents', 'ask', { query })`), not raw completion
 * prompts — the agent supplies its own system persona.
 */
export function buildNameColorQuery(hex: string): string {
  return `Give this color a short, creative name (2-4 words): ${hex}`;
}

export function buildPaletteFromColorQuery(hex: string): string {
  return `Generate a 5-color palette that pairs well with ${hex}. Give me the hex codes.`;
}
