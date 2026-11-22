import { describe, expect, it } from 'vitest'

import { readSlotHeaderLayout, type SlotDescription, SlotMismatchError } from '../../patch/slot'
import header from '../../../rom/gen3/include/replay_progress.h?raw'
import slotHeader from '../../../rom/gen3/include/replay_slot.h?raw'
import { FRAME_BYTES } from './frame'
import { frameHandler, writeStream } from './game'
import type { GameModule } from './game'
import { readProgressLayout } from './progress'
import { CONTROL, createShared, grant, readStatus } from './protocol'

const LAYOUT = readProgressLayout(header)
const SLOT_LAYOUT = readSlotHeaderLayout(slotHeader)
const SLOT = 0x1000
const PROGRESS = 0x3000
const PIXELS = 0x4000
const MAGIC = 'IRV_SLOT'

// The ROM's slot description as replay-slot.json gives it: the slot at 0x3000 of the ROM image.
const ROM_SLOT: SlotDescription = {
  slotVersion: 1,
  magic: MAGIC,
  offset: 0x3000,
  size: 0x100,
  headerSize: 0x20,
  lengthOffset: 0x3010,
  streamOffset: 0x3020,
  capacity: 0xe0,
  romSha1: '0'.repeat(40),
  romSize: 0x2000000,
}

// The module's slot with the header its build wrote (rom/gen3/src/replay_slot.c).
function fakeGame(slot: { version?: number; size?: number } = {}): GameModule {
  const memory = new Uint8Array(PIXELS + FRAME_BYTES)
  memory.set(new TextEncoder().encode(MAGIC), SLOT)
  const view = new DataView(memory.buffer, SLOT)
  view.setUint16(0x08, slot.version ?? 1, true)
  view.setUint16(0x0a, 0x20, true)
  view.setUint32(0x0c, slot.size ?? 0x100, true)
  memory.fill(0xee, SLOT + 0x40, SLOT + 0x100)
  return {
    HEAPU8: memory,
    HEAPU16: new Uint16Array(memory.buffer),
    _AgbMain: () => undefined,
    _IrvWasm_Slot: () => SLOT,
    _IrvWasm_Progress: () => PROGRESS,
  }
}

describe('the stream in the module', () => {
  it("lands at the module's slot with its length, by the layout of the ROM's slot", () => {
    const game = fakeGame()
    writeStream(game, ROM_SLOT, Uint8Array.of(1, 2, 3), SLOT_LAYOUT)
    const view = new DataView(game.HEAPU8.buffer)
    expect(view.getUint32(SLOT + 0x10, true)).toBe(3)
    expect([...game.HEAPU8.subarray(SLOT + 0x20, SLOT + 0x24)]).toEqual([1, 2, 3, 0])
    expect(game.HEAPU8[SLOT + 0xff]).toBe(0)
    expect(game.HEAPU8[SLOT + 0x100]).toBe(0)
    expect(view.getUint32(SLOT + 0x0c, true)).toBe(0x100)
  })

  it('is refused when it does not fit the slot or the slot has no magic', () => {
    expect(() => {
      writeStream(fakeGame(), ROM_SLOT, new Uint8Array(0xe1), SLOT_LAYOUT)
    }).toThrow('the stream has 225 bytes, the replay slot holds 224')
    const game = fakeGame()
    game.HEAPU8.fill(0, SLOT, SLOT + 8)
    expect(() => {
      writeStream(game, ROM_SLOT, Uint8Array.of(1), SLOT_LAYOUT)
    }).toThrow(
      /^no IRV_SLOT magic at the start of the slot: it is not the slot the description names$/,
    )
  })

  it("is refused when the module's slot is larger than replay-slot.json says", () => {
    const game = fakeGame({ size: 0x20000 })
    expect(() => {
      writeStream(game, ROM_SLOT, Uint8Array.of(1), SLOT_LAYOUT)
    }).toThrow(
      new SlotMismatchError(
        'the slot gives slot size 0x20000 and replay-slot.json gives 0x100, so they come from ' +
          'different builds. Run npm run wasm:build again.',
      ),
    )
    expect(game.HEAPU8[SLOT + 0x20]).toBe(0)
  })

  it("is refused when the module's slot has another version than replay-slot.json", () => {
    expect(() => {
      writeStream(fakeGame({ version: 2 }), ROM_SLOT, Uint8Array.of(1), SLOT_LAYOUT)
    }).toThrow(
      'the slot gives version 2 and replay-slot.json gives 1, so they come from different ' +
        'builds. Run npm run wasm:build again.',
    )
  })
})

describe('the frame hook', () => {
  it('widens the frame into the shared buffer and reports the frame and the progress', () => {
    const game = fakeGame()
    const shared = createShared(16)
    const control = new Int32Array(shared.control)
    game.HEAPU16.fill(31, PIXELS >> 1, (PIXELS >> 1) + 240 * 160)
    const view = new DataView(game.HEAPU8.buffer, PROGRESS)
    view.setUint16(LAYOUT.offsets.done, 7, true)
    view.setUint8(LAYOUT.offsets.playing, 1)
    grant(control, 2)
    const onFrame = frameHandler(() => game, shared, LAYOUT)
    onFrame(PIXELS)
    expect([...new Uint8Array(shared.frame, 0, 4)]).toEqual([0xff, 0, 0, 0xff])
    expect(readStatus(control)).toMatchObject({ frame: 1, done: 7, playing: true })
    view.setUint8(LAYOUT.offsets.finished, 1)
    onFrame(PIXELS)
    expect(readStatus(control)).toMatchObject({ frame: 2, finishedAt: 2, finished: true })
  })

  it('plays on at fast without a grant', () => {
    const game = fakeGame()
    const shared = createShared(16)
    const control = new Int32Array(shared.control)
    grant(control, undefined)
    const onFrame = frameHandler(() => game, shared, LAYOUT)
    for (let i = 0; i < 5; i++) onFrame(PIXELS)
    expect(control[CONTROL.frame]).toBe(5)
  })
})
