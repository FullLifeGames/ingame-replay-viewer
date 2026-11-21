// The probes of the screenshot run (plan section 7): numbers read from the frames that
// rom/gen3/shot/replay_shot.c writes, never images kept in the tree. Each probe asks one question
// of a frame or a pair of frames; checkShots answers a scene's question from its named frames.
import type { Side } from '../src/script/types.ts'

export interface Frame {
  width: number
  height: number
  /** Red, green and blue per pixel, row by row. */
  rgb: Uint8Array
}

export interface Region {
  x: number
  y: number
  width: number
  height: number
}

/** One pixel row of an HP bar and the colours of its empty part. */
export interface HpBar {
  x: number
  y: number
  width: number
  empty: readonly number[]
}

// Where the probes look on the 240x160 screen of a singles battle. Lines are of the pinned tree's
// own files (U = .cache/rom/expansion, 79dd436); the HP bar row was measured once on the first-hp
// frame of the hand-made run (B6a).
export const SCREEN = {
  // PrintHpOnHealthbox clears (xOffset + 40, yOffset + 8, 56, 8) before it prints the numbers
  // (U/src/battle_interface.c:935), called with xOffset 0 and yOffset 16 for the near side (:1092).
  // The near healthbox is a 64x32 sprite (:217) centred on (158, 88) (:845), so its corner is
  // (126, 72).
  nearHpDigits: { x: 166, y: 96, width: 56, height: 8 },
  // The far healthbox is centred on (44, 30) (:846), its corner (12, 14); the healthbar sprite sits
  // 16 pixels right of it (:741). Measured: the bar's upper fill row is y 33, x 52 to 99, and its
  // empty part shows 0x4a425a of the healthbar palette (gBattleInterface_BallDisplayPal,
  // U/src/battle_gfx_sfx_util.c:87).
  farHpBar: { x: 52, y: 33, width: 48, empty: [0x4a425a] },
  // Each healthbox is two 64x32 sprites side by side from its corner, cut at the screen's edge.
  healthbox: {
    near: { x: 126, y: 72, width: 114, height: 32 },
    far: { x: 12, y: 14, width: 128, height: 32 },
  },
  screen: { x: 0, y: 0, width: 240, height: 160 },
  // B_WIN_MSG: tilemapLeft 2, tilemapTop 15, 26x4 tiles of 8 pixels (U/src/battle_bg.c:158).
  message: { x: 16, y: 120, width: 208, height: 32 },
} as const satisfies {
  nearHpDigits: Region
  farHpBar: HpBar
  healthbox: Record<Side, Region>
  message: Region
  screen: Region
}

export type Check =
  | { probe: 'differs'; before: string; after: string; region?: Region }
  | { probe: 'blank'; shot: string; region: Region; colour?: number }
  | { probe: 'bar'; shot: string; bar: HpBar; filled: number }
  | { probe: 'text'; shot: string; region: Region }

export interface Verdict {
  pass: boolean
  detail: string
}

// "P6", width, height, 255, each followed by one whitespace byte; the tool writes newlines.
const PPM_HEADER = /^P6\s(\d+)\s(\d+)\s255\s/

export function readPpm(bytes: Uint8Array): Frame {
  const head = String.fromCharCode(...bytes.subarray(0, 32))
  const match = PPM_HEADER.exec(head)
  if (match === null) throw new Error('no binary PPM of 8-bit RGB')
  const width = Number(match[1])
  const height = Number(match[2])
  const rgb = bytes.subarray(match[0].length)
  if (rgb.length !== width * height * 3) {
    throw new Error(
      `the PPM has ${String(rgb.length)} bytes of pixels, ${String(width)}x${String(height)} needs ${String(width * height * 3)}`,
    )
  }
  return { width, height, rgb }
}

/** The pixel as 0xRRGGBB. */
function colourAt(frame: Frame, x: number, y: number): number {
  const at = (y * frame.width + x) * 3
  return ((frame.rgb[at] ?? 0) << 16) | ((frame.rgb[at + 1] ?? 0) << 8) | (frame.rgb[at + 2] ?? 0)
}

function coloursIn(frame: Frame, region: Region): number[] {
  const colours: number[] = []
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) colours.push(colourAt(frame, x, y))
  }
  return colours
}

const wholeFrame = (frame: Frame): Region => ({
  x: 0,
  y: 0,
  width: frame.width,
  height: frame.height,
})

export function differingPixels(before: Frame, after: Frame, region = wholeFrame(before)): number {
  const old = coloursIn(before, region)
  return coloursIn(after, region).filter((colour, i) => colour !== old[i]).length
}

/** The area shows one colour: no digit, no text. */
export function isBlank(frame: Frame, region: Region): boolean {
  return new Set(coloursIn(frame, region)).size === 1
}

export function filledBarPixels(frame: Frame, bar: HpBar): number {
  const row = coloursIn(frame, { x: bar.x, y: bar.y, width: bar.width, height: 1 })
  return row.filter((colour) => !bar.empty.includes(colour)).length
}

/** The pixels unlike the window's most common colour, which is its background. */
export function textPixels(frame: Frame, region: Region): number {
  const counts = new Map<number, number>()
  const colours = coloursIn(frame, region)
  for (const colour of colours) counts.set(colour, (counts.get(colour) ?? 0) + 1)
  return colours.length - Math.max(...counts.values())
}

const hexColour = (colour: number) => `0x${colour.toString(16).padStart(6, '0')}`

function blankVerdict(frame: Frame, region: Region, colour: number | undefined): Verdict {
  if (!isBlank(frame, region)) return { pass: false, detail: 'more than one colour' }
  if (colour === undefined) return { pass: true, detail: 'one colour' }
  const found = colourAt(frame, region.x, region.y)
  if (found === colour) return { pass: true, detail: `one colour, ${hexColour(colour)}` }
  return { pass: false, detail: `one colour, ${hexColour(found)}, not ${hexColour(colour)}` }
}

// A message of the battle text box has far more glyph pixels than this.
const MIN_TEXT_PIXELS = 20

function verdictOf(check: Check, frame: (name: string) => Frame): Verdict {
  switch (check.probe) {
    case 'differs': {
      const count = differingPixels(frame(check.before), frame(check.after), check.region)
      return { pass: count > 0, detail: `${String(count)} pixels differ` }
    }
    case 'blank':
      return blankVerdict(frame(check.shot), check.region, check.colour)
    case 'bar': {
      const filled = filledBarPixels(frame(check.shot), check.bar)
      const detail = `${String(filled)} of ${String(check.bar.width)} pixels filled, ${String(check.filled)} expected`
      return { pass: Math.abs(filled - check.filled) <= 1, detail }
    }
    case 'text': {
      const count = textPixels(frame(check.shot), check.region)
      return { pass: count >= MIN_TEXT_PIXELS, detail: `${String(count)} text pixels` }
    }
  }
}

class MissingFrame extends Error {}

export function checkShots(check: Check, frames: ReadonlyMap<string, Frame>): Verdict {
  const frame = (name: string) => {
    const found = frames.get(name)
    if (found === undefined) throw new MissingFrame(name)
    return found
  }
  try {
    return verdictOf(check, frame)
  } catch (error) {
    if (!(error instanceof MissingFrame)) throw error
    return { pass: false, detail: `no frame "${error.message}": the replay never reached it` }
  }
}
