import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { checkShots, SCREEN } from './rom-shot-probes.ts'
import { PROGRESS_HEADER_PATH, readProgressLayout } from './rom-shot-run.ts'
import type { ProgressLayout } from './rom-shot-run.ts'
import type { Scene } from './rom-shot-scenes.ts'
import { GBA_ROM_BASE, loadSlotLayout } from './rom-slot.ts'
import { MIXER_RATE } from '../src/web/wasm/protocol.ts'
import { frameLines } from './wasm-hashes.ts'
import { playCommand, playModule, runPlace, STALL_FRAMES } from './wasm-run.ts'
import type { GameModule, ModuleHooks } from './wasm-run.ts'

// The class of a WebAssembly trap, by its name.
class RuntimeError extends Error {
  override name = 'RuntimeError'
}

const LAYOUT = readProgressLayout(readFileSync(PROGRESS_HEADER_PATH, 'utf8'))
const SLOT_LAYOUT = loadSlotLayout()
const SLOT = GBA_ROM_BASE + 0x1000
const PROGRESS = GBA_ROM_BASE + 0x22000
const PIXELS = GBA_ROM_BASE + 0x24000
const PIXEL_COUNT = 240 * 160
// One frame of the fake's sound: two left and right pairs at half volume.
const AUDIO = GBA_ROM_BASE + 0x38000
const AUDIO_SAMPLES = [0.5, -0.5, -0.5, 0.5]

interface Progress {
  done: number
  total: number
  error: number
  finished: boolean
  playing: boolean
}

/** What the fake game shows on a frame: its progress and one colour over the whole screen. */
type Script = (frame: number) => { progress: Progress; colour: number }

interface Fake {
  factory: (hooks: ModuleHooks) => Promise<GameModule>
  /** The slot's bytes as AgbMain found them. */
  slotAtStart: () => Uint8Array | undefined
}

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
function fakeModule(script: Script, layout = LAYOUT, limit = 20000): Fake {
  // Untouched pages of a large buffer cost no memory.
  const memory = new Uint8Array(GBA_ROM_BASE + 0x40000)
  const words = new Uint16Array(memory.buffer)
  emptySlot(memory)
  new Float32Array(memory.buffer, AUDIO, AUDIO_SAMPLES.length).set(AUDIO_SAMPLES)
  let slotAtStart: Uint8Array | undefined
  const factory = (hooks: ModuleHooks) =>
    Promise.resolve<GameModule>({
      HEAPU8: memory,
      HEAPU16: words,
      _IrvWasm_Slot: () => SLOT,
      _IrvWasm_Progress: () => PROGRESS,
      _AgbMain: () => {
        slotAtStart = memory.slice(SLOT, SLOT + SLOT_LAYOUT.size)
        for (let frame = 1; frame <= limit; frame++) {
          const { progress, colour } = script(frame)
          writeProgress(memory, layout, progress)
          words.fill(colour, PIXELS >> 1, (PIXELS >> 1) + PIXEL_COUNT)
          hooks.irvAudio(AUDIO, AUDIO_SAMPLES.length, MIXER_RATE)
          hooks.irvFrame(PIXELS)
        }
      },
    })
  return { factory, slotAtStart: () => slotAtStart }
}

const playing = (done: number, total = 34): Progress => ({
  done,
  total,
  error: 0,
  finished: false,
  playing: true,
})

const scene = (name: string, done: number, frames: number): Scene => ({
  name,
  shots: [{ name, done, frames }],
  check: { probe: 'text', shot: name, region: { x: 0, y: 0, width: 1, height: 1 } },
})

describe('playing a stream in the module', () => {
  it('writes the stream into the slot with its length at +0x10 before AgbMain runs', async () => {
    const fake = fakeModule((frame) => ({ progress: playing(frame < 5 ? 0 : 34), colour: 0 }))
    const stream = Uint8Array.from([1, 0, 0x22, 7, 9])
    await playModule(fake.factory, { stream, scenes: [], layout: LAYOUT })
    const slot = fake.slotAtStart()
    expect(slot).toBeDefined()
    const view = new DataView((slot as Uint8Array).buffer)
    expect(view.getUint32(0x10, true)).toBe(stream.length)
    const at = SLOT_LAYOUT.headerSize
    expect(Array.from((slot as Uint8Array).subarray(at, at + 6))).toEqual([1, 0, 0x22, 7, 9, 0])
  })

  it('leaves the slot empty when it gets no stream', async () => {
    const fake = fakeModule(() => ({ progress: { ...playing(0, 0), error: 1 }, colour: 0 }))
    await playModule(fake.factory, { stream: undefined, scenes: [], layout: LAYOUT })
    expect(new DataView((fake.slotAtStart() as Uint8Array).buffer).getUint32(0x10, true)).toBe(0)
  })

  it(`ends a run as a stall after ${String(STALL_FRAMES)} frames on one op, with that op`, async () => {
    const fake = fakeModule((frame) => ({ progress: playing(frame < 100 ? 2 : 3), colour: 0 }))
    const run = await playModule(fake.factory, { stream: undefined, scenes: [], layout: LAYOUT })
    expect(run.output.status).toEqual({
      status: 'stall',
      frame: 100 + STALL_FRAMES,
      done: 3,
      total: 34,
      turn: 0,
      error: 0,
    })
    expect(run.frames.has('final')).toBe(true)
  })

  it('reads finished at the offsets of the layout it gets', async () => {
    const moved: ProgressLayout = {
      ...LAYOUT,
      offsets: { done: 2, total: 0, turn: 4, error: 9, finished: 6, playing: 7 },
    }
    const done = { ...playing(34), finished: true }
    const fake = fakeModule(
      (frame) => ({ progress: frame < 50 ? playing(5) : done, colour: 0 }),
      moved,
    )
    const run = await playModule(fake.factory, { stream: undefined, scenes: [], layout: moved })
    expect(run.output.status).toMatchObject({ status: 'finished', frame: 50, done: 34, total: 34 })
    expect(run.finishedAt).toBe(50)
  })

  it('takes a shot `frames` frames after its op is reached while the game plays', async () => {
    const fake = fakeModule((frame) => ({
      progress: frame < 10 ? { ...playing(1), playing: false } : playing(Math.min(frame, 40)),
      colour: frame,
    }))
    const scenes = [scene('one', 1, 0), scene('twenty', 20, 5)]
    const run = await playModule(fake.factory, { stream: undefined, scenes, layout: LAYOUT })
    expect(run.output.shots).toEqual([{ shot: 'twenty', frame: 25, done: 25 }])
    expect(run.frames.has('one')).toBe(false)
    expect(run.frames.get('twenty')?.rgb.subarray(0, 3)).toEqual(Uint8Array.from([0xce, 0, 0]))
  })

  it('keeps playing past END while a shot is due and ends 600 frames later as finished', async () => {
    const end = { ...playing(34), finished: true }
    const fake = fakeModule((frame) => ({ progress: frame < 30 ? playing(1) : end, colour: 0 }))
    const scenes = [scene('held', 34, 600)]
    const run = await playModule(fake.factory, { stream: undefined, scenes, layout: LAYOUT })
    expect(run.output.status).toMatchObject({ status: 'finished', frame: 630, error: 0 })
    expect(run.output.shots).toEqual([{ shot: 'held', frame: 630, done: 34 }])
    expect(run.finishedAt).toBe(30)
  })

  it('ends a refused run 30 frames after the error, its last frame in the refusal colour', async () => {
    const red = 12 // REPLAY_REFUSED_RED, as the fake's own BGR555 colour
    const fake = fakeModule((frame) => ({
      progress: { ...playing(0, 0), playing: false, error: frame < 8 ? 0 : 1 },
      colour: frame < 8 ? 0x7fff : red,
    }))
    const run = await playModule(fake.factory, { stream: undefined, scenes: [], layout: LAYOUT })
    expect(run.output.status).toMatchObject({ status: 'error', frame: 38, error: 1 })
    // The fake draws one colour, so it shows no refusal text; its last frame is the backdrop.
    const backdrop = { probe: 'blank', shot: 'final', region: SCREEN.screen } as const
    expect(checkShots({ ...backdrop, colour: LAYOUT.refusedColour }, run.frames)).toEqual({
      pass: true,
      detail: 'one colour, 0x630000',
    })
  })

  it("counts the game's samples and measures their loudness", async () => {
    const end = { ...playing(34), finished: true }
    const fake = fakeModule((frame) => ({ progress: frame < 30 ? playing(1) : end, colour: 0 }))
    const run = await playModule(fake.factory, { stream: undefined, scenes: [], layout: LAYOUT })
    expect(run.audio.samples).toBe(run.output.status.frame * AUDIO_SAMPLES.length)
    expect(run.audio.rms).toBeCloseTo(0.5)
  })

  it('hashes every frame it plays, the last one too, for the A/B against the baseline', async () => {
    const end = { ...playing(34), finished: true }
    const fake = fakeModule((frame) => ({
      progress: frame < 30 ? playing(1) : end,
      colour: frame < 10 ? 0 : 7,
    }))
    const run = await playModule(fake.factory, { stream: undefined, scenes: [], layout: LAYOUT })
    expect(run.hashes.frames).toBe(30)
    expect(frameLines(run.hashes, 9)).toEqual(frameLines(run.hashes, 1))
    expect(frameLines(run.hashes, 10)).not.toEqual(frameLines(run.hashes, 9))
    expect(frameLines(run.hashes, 30)).toEqual(frameLines(run.hashes, 10))
  })

  it('fails when AgbMain returns, which the game never does', async () => {
    const fake = fakeModule(() => ({ progress: playing(1), colour: 0 }), LAYOUT, 3)
    await expect(
      playModule(fake.factory, { stream: undefined, scenes: [], layout: LAYOUT }),
    ).rejects.toThrow('AgbMain returned after 3 frames')
  })

  it('passes a trap on with the frame it happened on', async () => {
    const fake = fakeModule((frame) => {
      if (frame === 4) throw new RuntimeError('unreachable')
      return { progress: playing(1), colour: 0 }
    })
    await expect(
      playModule(fake.factory, { stream: undefined, scenes: [], layout: LAYOUT }),
    ).rejects.toThrow('the module trapped after 3 frames: RuntimeError: unreachable')
  })
})

describe('the run of one stream', () => {
  it('runs in its own process under timeout, since a hang inside the module cannot be stopped', () => {
    const [command, ...args] = playCommand('/repo/build/wasm/run/hand-made', 900)
    expect(command).toBe('timeout')
    expect(args.slice(0, 2)).toEqual(['--kill-after=10', '900'])
    expect(args.slice(3)).toEqual([
      expect.stringMatching(/scripts\/wasm-run\.ts$/),
      '--play',
      '/repo/build/wasm/run/hand-made',
    ])
  })
})

describe('the module a run plays', () => {
  it('is the module of build/wasm, its runs in build/wasm/run', () => {
    expect(runPlace('/repo/build/wasm')).toEqual({
      module: '/repo/build/wasm/irv-emerald.js',
      runDir: '/repo/build/wasm/run',
    })
  })

  it('is the sanitized module under build/wasm/sanitize with --sanitize (#44)', () => {
    expect(runPlace('/repo/build/wasm', 'shift')).toEqual({
      module: '/repo/build/wasm/sanitize/irv-emerald.js',
      runDir: '/repo/build/wasm/sanitize/run',
    })
  })
})
