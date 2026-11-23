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
// own files (U = .cache/rom/expansion, 79dd436); the far HP bar and the healthbox background were
// measured on frames, as their comments say.
export const SCREEN = {
  // PrintHpOnHealthbox clears (xOffset + 40, yOffset + 8, 56, 8) before it prints the numbers
  // (U/src/battle_interface.c:935), called with xOffset 0 and yOffset 16 for the near side (:1092).
  // The near healthbox is a 64x32 sprite (:217) centred on (158, 88) (:845), so its corner is
  // (126, 72).
  nearHpDigits: { x: 166, y: 96, width: 56, height: 8 },
  // The colour of that area with no digits in it, the healthbox background. Measured on the
  // send-outs frame of 994052 (fix step): all 448 pixels of the area show it.
  healthboxBackground: 0xffffde,
  // The far healthbox is centred on (44, 30) (:846). Measured only, on the first-hp frames of the
  // hand-made run (B6a) and of 994052 (fix step): in row 33 a full bar fills x 52 to 99, 48 pixels
  // (B_HEALTHBAR_PIXELS), and a partly filled bar ends in 0x4a425a of the healthbar palette
  // (gBattleInterface_BallDisplayPal, U/src/battle_gfx_sfx_util.c:87) up to x 99. The pinned lines
  // place the bar only roughly: the healthbar sprite sits 16 pixels right of the healthbox (:741),
  // its bar tiles start at its third tile (MoveBattleBarGraphically, :2238-2246), and the sprite
  // engine's corner offsets put it on the screen.
  farHpBar: { x: 52, y: 33, width: 48, empty: [0x4a425a] },
  // UpdateLvlInHealthbox prints "Lv" (CHAR_EXTRA_SYMBOL, CHAR_LV_2) and the level so that the text
  // ends at x 24 of the far healthbox's second sprite (U/src/battle_interface.c:890-907), whose
  // corner is (76, 14): at x 100. In FONT_SMALL the "Lv" glyph is 8 pixels wide and each digit 5
  // (gFontSmallLatinGlyphWidths, U/src/fonts.c:40, entries 0x105 and 0xA1-0xAA), with no letter
  // spacing. Measured on the send-outs frame of the hand-made run on mGBA: the glyph's pixels lie in
  // rows 21 to 28.
  farLevel: { end: 100, y: 21, height: 8, lvWidth: 8, digitWidth: 5 },
  // Each healthbox is two 64x32 sprites side by side from its corner, cut at the screen's edge.
  healthbox: {
    near: { x: 126, y: 72, width: 114, height: 32 },
    far: { x: 12, y: 14, width: 128, height: 32 },
  },
  screen: { x: 0, y: 0, width: 240, height: 160 },
  // The sky of the battle background, where a weather's animation shows over the whole screen
  // (#22): above the far healthbox, whose corner is at y 14, and left of the far mon, a 64x64
  // sprite centred on (176, 40) (sBattlerCoords, U/src/battle_anim_mons.c:42), away from both
  // ability pop-ups at (24, 97) and (178, 57) (sAbilityPopUpCoordsSingles,
  // U/src/battle_interface.c:2545-2549) and from the text box. Read from the pinned coordinates;
  // still to be measured on frames.
  sky: { x: 0, y: 0, width: 140, height: 14 },
  // B_WIN_MSG: tilemapLeft 2, tilemapTop 15, 26x4 tiles of 8 pixels (U/src/battle_bg.c:158).
  message: { x: 16, y: 120, width: 208, height: 32 },
} as const satisfies {
  nearHpDigits: Region
  healthboxBackground: number
  farHpBar: HpBar
  farLevel: { end: number; y: number; height: number; lvWidth: number; digitWidth: number }
  healthbox: Record<Side, Region>
  message: Region
  screen: Region
  sky: Region
}

export type Check =
  | {
      probe: 'differs'
      before: string
      after: string
      region?: Region
      /** The frame before must show more than one colour: drawn, not faded in yet. */
      beforeDrawn?: boolean
      /**
       * A region the frame after must show as the frame before does. A palette fade changes every
       * colour but black, so a frame on its way to black or black fails.
       */
      kept?: Region
    }
  | { probe: 'same'; before: string; after: string; region: Region }
  | { probe: 'blank'; shot: string; region: Region; colour?: number }
  | { probe: 'bar'; shot: string; bar: HpBar; filled: number }
  | {
      probe: 'text'
      shot: string
      region: Region
      /** The colour the text must stand on: the region's most common colour. */
      background?: number
    }
  | { probe: 'balls'; shot: string; cells: readonly Region[]; colour: number; balls: number }

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

/** The window's most common colour, its background, and how many pixels show it. */
function commonColour(frame: Frame, region: Region): { colour: number; count: number } {
  const counts = new Map<number, number>()
  for (const colour of coloursIn(frame, region)) counts.set(colour, (counts.get(colour) ?? 0) + 1)
  let common = { colour: 0, count: 0 }
  for (const [colour, count] of counts) if (count > common.count) common = { colour, count }
  return common
}

/** The pixels unlike the window's most common colour, which is its background. */
export function textPixels(frame: Frame, region: Region): number {
  return region.width * region.height - commonColour(frame, region).count
}

const hexColour = (colour: number) => `0x${colour.toString(16).padStart(6, '0')}`

function blankVerdict(frame: Frame, region: Region, colour: number | undefined): Verdict {
  if (!isBlank(frame, region)) return { pass: false, detail: 'more than one colour' }
  if (colour === undefined) return { pass: true, detail: 'one colour' }
  const found = colourAt(frame, region.x, region.y)
  if (found === colour) return { pass: true, detail: `one colour, ${hexColour(colour)}` }
  return { pass: false, detail: `one colour, ${hexColour(found)}, not ${hexColour(colour)}` }
}

const sameColours = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((colour, i) => colour === b[i])

/**
 * A ball display: the cells in fill order, the first `balls` of them pixel-equal to the first cell
 * and the rest unlike it. The first cell holds the ball's colour, so a display that is not drawn
 * cannot pass.
 */
function ballsVerdict(frame: Frame, check: Extract<Check, { probe: 'balls' }>): Verdict {
  const cells = check.cells.map((cell) => coloursIn(frame, cell))
  const first = cells[0] ?? []
  if (!first.includes(check.colour)) {
    return { pass: false, detail: `no ball in the first cell: no ${hexColour(check.colour)}` }
  }
  const isBall = cells.map((cell) => sameColours(cell, first))
  const count = isBall.filter(Boolean).length
  const detail = `${String(count)} ${count === 1 ? 'ball' : 'balls'}, ${String(check.balls)} expected`
  const gap = isBall.indexOf(false)
  if (gap >= 0 && gap < count) {
    return { pass: false, detail: `${detail}, with a gap at cell ${String(gap)}` }
  }
  return { pass: count === check.balls, detail }
}

function differsVerdict(
  before: Frame,
  after: Frame,
  check: Extract<Check, { probe: 'differs' }>,
): Verdict {
  const count = differingPixels(before, after, check.region)
  const detail = `${String(count)} pixels differ`
  if (check.beforeDrawn === true && isBlank(before, wholeFrame(before))) {
    return { pass: false, detail: `${detail}, but the frame before is one colour` }
  }
  const lost = check.kept === undefined ? 0 : differingPixels(before, after, check.kept)
  if (lost > 0) {
    return {
      pass: false,
      detail: `${detail}, but ${String(lost)} pixels of the kept region differ too`,
    }
  }
  return { pass: count > 0, detail }
}

// A message of the battle text box has far more glyph pixels than this.
const MIN_TEXT_PIXELS = 20

function textVerdict(frame: Frame, check: Extract<Check, { probe: 'text' }>): Verdict {
  const count = textPixels(frame, check.region)
  const detail = `${String(count)} text pixels`
  if (check.background === undefined) return { pass: count >= MIN_TEXT_PIXELS, detail }
  const { colour } = commonColour(frame, check.region)
  if (colour !== check.background) {
    const found = `the most common colour is ${hexColour(colour)}`
    return { pass: false, detail: `${found}, not ${hexColour(check.background)}` }
  }
  return { pass: count >= MIN_TEXT_PIXELS, detail: `${detail} on ${hexColour(colour)}` }
}

function verdictOf(check: Check, frame: (name: string) => Frame): Verdict {
  switch (check.probe) {
    case 'differs':
      return differsVerdict(frame(check.before), frame(check.after), check)
    case 'same': {
      const count = differingPixels(frame(check.before), frame(check.after), check.region)
      return { pass: count === 0, detail: `${String(count)} pixels differ` }
    }
    case 'blank':
      return blankVerdict(frame(check.shot), check.region, check.colour)
    case 'bar': {
      const filled = filledBarPixels(frame(check.shot), check.bar)
      const detail = `${String(filled)} of ${String(check.bar.width)} pixels filled, ${String(check.filled)} expected`
      return { pass: filled === check.filled, detail }
    }
    case 'text':
      return textVerdict(frame(check.shot), check)
    case 'balls':
      return ballsVerdict(frame(check.shot), check)
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
