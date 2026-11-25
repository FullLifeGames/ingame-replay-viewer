// A fake of the module for the specs of wasm:run: the exports the runner uses, with a script for
// the progress and the colour of each frame.
import { readFileSync } from 'node:fs'

import { MIXER_RATE } from '../src/web/wasm/protocol.ts'
import { PROGRESS_HEADER_PATH, readProgressLayout } from './rom-shot-run.ts'
import type { ProgressLayout } from './rom-shot-run.ts'
import { GBA_ROM_BASE, loadSlotLayout } from './rom-slot.ts'
import type { GameModule, ModuleHooks } from './wasm-run.ts'

export const LAYOUT = readProgressLayout(readFileSync(PROGRESS_HEADER_PATH, 'utf8'))
export const SLOT_LAYOUT = loadSlotLayout()
const SLOT = GBA_ROM_BASE + 0x1000
const PROGRESS = GBA_ROM_BASE + 0x22000
const PIXELS = GBA_ROM_BASE + 0x24000
const PIXEL_COUNT = 240 * 160
// One frame of the fake's sound: two left and right pairs at half volume.
const AUDIO = GBA_ROM_BASE + 0x38000
export const AUDIO_SAMPLES = [0.5, -0.5, -0.5, 0.5]

export interface Progress {
  done: number
  total: number
  error: number
  finished: boolean
  playing: boolean
}

/** What the fake game shows on a frame: its progress and one colour over the whole screen. */
export type Script = (frame: number) => { progress: Progress; colour: number }

export interface Fake {
  factory: (hooks: ModuleHooks) => Promise<GameModule>
  /** The slot's bytes as AgbMain found them. */
  slotAtStart: () => Uint8Array | undefined
  /** KEYINPUT as each frame read it, from frame 1. */
  keys: number[]
}

// KEYINPUT (include/gba/io_reg.h): all keys up, as the module's constructor sets it.
const KEYINPUT = 0x04000130
export const KEYS_UP = 0x03ff

// The slot as the C initializer leaves it in the module's data: magic, version, sizes, no stream.
function emptySlot(memory: Uint8Array): void {
  const view = new DataView(memory.buffer, SLOT)
  memory.set(new TextEncoder().encode(SLOT_LAYOUT.magic), SLOT)
  view.setUint16(SLOT_LAYOUT.offsets.version, SLOT_LAYOUT.version, true)
  view.setUint16(SLOT_LAYOUT.offsets.headerSize, SLOT_LAYOUT.headerSize, true)
  view.setUint32(SLOT_LAYOUT.offsets.slotSize, SLOT_LAYOUT.size, true)
}

function writeProgress(memory: Uint8Array, layout: ProgressLayout, progress: Progress): void {
  const view = new DataView(memory.buffer, PROGRESS)
  view.setUint16(layout.offsets.done, progress.done, true)
  view.setUint16(layout.offsets.total, progress.total, true)
  view.setUint8(layout.offsets.error, progress.error)
  view.setUint8(layout.offsets.finished, progress.finished ? 1 : 0)
  view.setUint8(layout.offsets.playing, progress.playing ? 1 : 0)
}

// A module object with the exports the harness uses. AgbMain plays the script for at most
// `limit` frames and then returns, which the real game never does.
export function fakeModule(script: Script, layout = LAYOUT, limit = 20000): Fake {
  // Untouched pages of a large buffer cost no memory.
  const memory = new Uint8Array(GBA_ROM_BASE + 0x40000)
  const words = new Uint16Array(memory.buffer)
  emptySlot(memory)
  new Float32Array(memory.buffer, AUDIO, AUDIO_SAMPLES.length).set(AUDIO_SAMPLES)
  let slotAtStart: Uint8Array | undefined
  const keys: number[] = []
  words[KEYINPUT >> 1] = KEYS_UP
  const factory = (hooks: ModuleHooks) =>
    Promise.resolve<GameModule>({
      HEAPU8: memory,
      HEAPU16: words,
      _IrvWasm_Slot: () => SLOT,
      _IrvWasm_Progress: () => PROGRESS,
      _AgbMain: () => {
        slotAtStart = memory.slice(SLOT, SLOT + SLOT_LAYOUT.size)
        for (let frame = 1; frame <= limit; frame++) {
          keys.push(words[KEYINPUT >> 1] as number)
          const { progress, colour } = script(frame)
          writeProgress(memory, layout, progress)
          words.fill(colour, PIXELS >> 1, (PIXELS >> 1) + PIXEL_COUNT)
          hooks.irvAudio(AUDIO, AUDIO_SAMPLES.length, MIXER_RATE)
          hooks.irvFrame(PIXELS)
        }
      },
    })
  return { factory, slotAtStart: () => slotAtStart, keys }
}

export const playing = (done: number, total = 34): Progress => ({
  done,
  total,
  error: 0,
  finished: false,
  playing: true,
})
