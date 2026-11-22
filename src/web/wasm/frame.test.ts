import { describe, expect, it } from 'vitest'

import { FRAME_BYTES, FRAME_HEIGHT, FRAME_WIDTH, widenChannel, widenFrame } from './frame'

const PIXELS = FRAME_WIDTH * FRAME_HEIGHT

describe('a frame of the game', () => {
  it('is 240x160 pixels, and 240x160x4 bytes as RGBA', () => {
    expect([FRAME_WIDTH, FRAME_HEIGHT]).toEqual([240, 160])
    expect(FRAME_BYTES).toBe(240 * 160 * 4)
  })

  it('widens a five-bit channel as mGBA does: the five bits, then their top three', () => {
    expect([0, 1, 12, 31].map(widenChannel)).toEqual([0, 0x08, 0x63, 0xff])
  })

  // BGR555: red in bits 0-4, green in 5-9, blue in 10-14; bit 15 is unused.
  it('widens BGR555 words into RGB or RGBA bytes, from the word it is told to start at', () => {
    const words = new Uint16Array(PIXELS + 2)
    words[2] = 31 | (1 << 5) | (12 << 10) | 0x8000
    words[3] = 1 << 10
    const rgb = new Uint8Array(PIXELS * 3)
    widenFrame(words, 2, rgb, 3)
    expect([...rgb.subarray(0, 6)]).toEqual([0xff, 0x08, 0x63, 0, 0, 0x08])
    const rgba = new Uint8Array(FRAME_BYTES)
    widenFrame(words, 2, rgba, 4)
    expect([...rgba.subarray(0, 8)]).toEqual([0xff, 0x08, 0x63, 0xff, 0, 0, 0x08, 0xff])
    expect(rgba[FRAME_BYTES - 1]).toBe(0xff)
  })

  it('refuses an output of another size', () => {
    const words = new Uint16Array(PIXELS)
    expect(() => {
      widenFrame(words, 0, new Uint8Array(PIXELS * 3), 4)
    }).toThrow(
      `a frame of 240x160 at 4 bytes per pixel takes ${String(FRAME_BYTES)} bytes, not 115200`,
    )
  })
})
