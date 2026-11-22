// A frame of the game as the WebAssembly build hands it over: 240x160 BGR555 words (red in bits
// 0-4, green in 5-9, blue in 10-14). It is widened to eight bits per channel as mGBA widens it, so
// the frames of both engines compare byte for byte. DOM-free: the page's worker, the Node harness
// (scripts/wasm-run.ts) and the shot tooling share it.

export const FRAME_WIDTH = 240
export const FRAME_HEIGHT = 160
const PIXELS = FRAME_WIDTH * FRAME_HEIGHT
/** A frame as RGBA, the layout of the page's shared frame buffer and of an ImageData. */
export const FRAME_BYTES = PIXELS * 4

/** mGBA widens each five-bit channel of a GBA colour to eight bits: the five bits, then their top three. */
export const widenChannel = (channel: number) => (channel << 3) | (channel >> 2)

/**
 * Widens the frame that starts at word `first` of `words` into `out`: three bytes per pixel (RGB)
 * or four (RGBA, alpha opaque).
 */
export function widenFrame(
  words: Uint16Array,
  first: number,
  out: Uint8Array,
  bytesPerPixel: 3 | 4,
): void {
  if (out.length !== PIXELS * bytesPerPixel) {
    throw new Error(
      `a frame of ${String(FRAME_WIDTH)}x${String(FRAME_HEIGHT)} at ${String(bytesPerPixel)} bytes per pixel takes ${String(PIXELS * bytesPerPixel)} bytes, not ${String(out.length)}`,
    )
  }
  for (let i = 0; i < PIXELS; i++) {
    const colour = words[first + i] ?? 0
    const at = i * bytesPerPixel
    out[at] = widenChannel(colour & 0x1f)
    out[at + 1] = widenChannel((colour >> 5) & 0x1f)
    out[at + 2] = widenChannel((colour >> 10) & 0x1f)
    if (bytesPerPixel === 4) out[at + 3] = 0xff
  }
}
