import { describe, expect, it } from 'vitest'

import header from '../../../rom/gen3/include/replay_progress.h?raw'
import { readProgress, readProgressLayout } from './progress'

// The offset defines a test header needs besides the size and the colour.
const OFFSETS = ['DONE', 'TOTAL', 'TURN', 'ERROR', 'FINISHED', 'PLAYING']
  .map((name, i) => `#define REPLAY_PROGRESS_OFFSET_${name} ${String(i)}\n`)
  .join('')

describe('the layout of the replay progress', () => {
  it('comes from replay_progress.h: the size and offsets of struct ReplayProgress and the refusal colour', () => {
    expect(readProgressLayout(header)).toEqual({
      size: 12,
      offsets: { done: 0, total: 2, turn: 4, error: 6, finished: 7, playing: 8 },
      refusedColour: 0x630000,
    })
  })

  it('widens the five bits of the red channel to eight, as mGBA does', () => {
    const withRed = (red: string) =>
      `${OFFSETS}#define REPLAY_PROGRESS_SIZE 8\n#define REPLAY_REFUSED_RED ${red} // the backdrop\n`
    expect(readProgressLayout(withRed('31')).refusedColour).toBe(0xff0000)
    expect(readProgressLayout(withRed('0x01')).refusedColour).toBe(0x080000)
  })

  it('refuses a define that is missing or no plain number', () => {
    expect(() => readProgressLayout(`${OFFSETS}#define REPLAY_REFUSED_RED 12\n`)).toThrow(
      'replay_progress.h: REPLAY_PROGRESS_SIZE missing',
    )
    expect(() =>
      readProgressLayout('#define REPLAY_PROGRESS_SIZE 8\n#define REPLAY_REFUSED_RED 12\n'),
    ).toThrow('replay_progress.h: REPLAY_PROGRESS_OFFSET_DONE missing')
    expect(() =>
      readProgressLayout(
        `${OFFSETS}#define REPLAY_PROGRESS_SIZE 8\n#define REPLAY_REFUSED_RED (6 * 2)\n`,
      ),
    ).toThrow('replay_progress.h: REPLAY_REFUSED_RED is "(6 * 2)", not a plain number')
  })
})

describe('reading the progress from memory', () => {
  it('reads each field at its offset, little-endian, at the address it gets', () => {
    const layout = readProgressLayout(header)
    const memory = new Uint8Array(64)
    const view = new DataView(memory.buffer, 16)
    view.setUint16(layout.offsets.done, 461, true)
    view.setUint16(layout.offsets.total, 462, true)
    view.setUint16(layout.offsets.turn, 30, true)
    view.setUint8(layout.offsets.error, 2)
    view.setUint8(layout.offsets.finished, 1)
    expect(readProgress(memory.subarray(8), 8, layout)).toEqual({
      done: 461,
      total: 462,
      turn: 30,
      error: 2,
      finished: true,
      playing: false,
    })
  })
})
