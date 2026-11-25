import { describe, expect, it, vi } from 'vitest'

import type { RunPlan } from '../../gen5/hook'
import type { MacroStep } from '../../gen5/macro'
import { MAIN_RAM_SIZE, MAIN_RAM_START, mainRamAt } from '../../gen5/main-ram'
import { sha256, toBase64 } from './codec'
import { type FrameGame, frameHook } from './frame-hook'

// Every address and offset in this spec is invented; none comes from the game.
const FLAG = MAIN_RAM_START + 0x100
const OTHER = MAIN_RAM_START + 0x104
const VALUE = MAIN_RAM_START + 0x108
/** A fixed word that points at a heap object, as the game's proc manager pointer does. */
const POINTER = MAIN_RAM_START + 0x200
const OBJECT = MAIN_RAM_START + 0x1000

/** A core that counts frames and lets a spec change RAM while a frame runs. */
class FakeGame implements FrameGame {
  frame = 0
  readonly inputs: string[] = []
  readonly heap = new Uint8Array(MAIN_RAM_SIZE)
  /** What each frame saw at FLAG while it ran. */
  readonly seen: number[] = []
  duringFrame: (frame: number, heap: Uint8Array) => void = () => undefined
  onLoad: (heap: Uint8Array) => void = () => undefined

  getFrameNum(): number {
    return this.frame
  }
  simulateInput(player: number, button: number, value: number): void {
    this.inputs.push(`${String(this.frame)}: ${String(player)}/${String(button)}=${String(value)}`)
  }
  getState(): Uint8Array {
    return Uint8Array.of(1, 2, 3)
  }
  loadState(): void {
    this.onLoad(this.heap)
  }
  screenshot(): Promise<Uint8Array> {
    return Promise.resolve(Uint8Array.of(9))
  }
  /** Runs `count` emulated frames in one iteration of the main loop. */
  run(count = 1): void {
    for (let i = 0; i < count; i += 1) {
      this.seen.push(this.heap[FLAG - MAIN_RAM_START] ?? 0)
      this.duringFrame(this.frame, this.heap)
      this.frame += 1
    }
  }
}

function setup() {
  const game = new FakeGame()
  const ram = mainRamAt(() => game.heap, 0)
  const hook = frameHook(
    () => game,
    () => ram,
  )
  const frames: number[] = []
  /** One main-loop iteration: the hook, then `count` core frames. */
  const iterate = (count = 1) => {
    hook.preMainLoop()
    frames.push(hook.frame())
    game.run(count)
  }
  return { game, hook, frames, iterate }
}

const plan = (steps: MacroStep[], more: Partial<RunPlan> = {}): RunPlan => ({
  steps,
  startFrame: 0,
  watch: [],
  ...more,
})
const write = (name: string, address: number, byte: number): MacroStep => ({
  kind: 'write',
  name,
  writes: [{ kind: 'bytes', field: name, address, bytes: [byte] }],
})

const setWord = (heap: Uint8Array, address: number, value: number) => {
  new DataView(heap.buffer).setUint32(address - MAIN_RAM_START, value, true)
}

// Scene: the hook plays a macro one emulated frame at a time; a write must be in RAM before the
// frame it belongs to runs, or the game reads the old value for a frame.
describe('frameHook', () => {
  it('applies a write before the frame it belongs to', () => {
    const { game, hook, iterate } = setup()
    hook.calls.queueRun(plan([{ kind: 'wait', frames: 2 }, write('flag', FLAG, 0x5a)]))
    for (let i = 0; i < 4; i += 1) iterate()
    expect(game.seen).toEqual([0, 0, 0x5a, 0x5a])
    expect(hook.calls.runReport()).toMatchObject({
      status: 'done',
      watch: ['2: wrote flag'],
    })
  })

  // Scene: on a slow device the core can run two frames between two calls of the hook.
  it('still applies the writes of a frame it did not see, keeps the macro on its frame, and counts the jump', () => {
    const { game, hook, iterate } = setup()
    const steps = [
      write('flag', FLAG, 0x11),
      write('other', OTHER, 0x22),
      write('flag', FLAG, 0x33),
    ]
    hook.calls.queueRun(plan([...steps, { kind: 'wait', frames: 3 }]))
    iterate(2)
    iterate()
    expect(game.heap[OTHER - MAIN_RAM_START]).toBe(0x22)
    expect(game.seen).toEqual([0x11, 0x11, 0x33])
    expect(hook.calls.runReport().jumps).toBe(1)
  })

  it('counts every frame the core ran between two calls as a jump', () => {
    const { hook, iterate } = setup()
    hook.calls.queueRun(plan([{ kind: 'wait', frames: 20 }]))
    iterate()
    iterate(3)
    iterate()
    iterate(4)
    iterate()
    expect(hook.calls.runReport().jumps).toBe(5)
  })

  it('logs a watched value while an until step waits, only when it changed', () => {
    const { game, hook, iterate } = setup()
    game.duringFrame = (frame, heap) => {
      const at = VALUE - MAIN_RAM_START
      if (frame === 2) heap[at] = 1
      if (frame === 5) heap[at] = 2
      if (frame === 7) heap[FLAG - MAIN_RAM_START] = 3
    }
    const until: MacroStep = {
      kind: 'until',
      name: 'flag',
      checks: [{ name: 'flag', address: FLAG, width: 1, oneOf: [3] }],
      holdFor: 1,
      limit: 20,
    }
    hook.calls.queueRun(plan([until], { watch: [{ name: 'value', address: VALUE, width: 1 }] }))
    for (let i = 0; i < 10; i += 1) iterate()
    expect(hook.calls.runReport()).toMatchObject({
      status: 'done',
      watch: ['0: value=0x0', '3: value=0x1', '6: value=0x2'],
    })
  })

  // Scene: the game's clock reads the emulated frame, so a run from a state moves it to the
  // state's frame, and a later run goes on from there instead of from the page's own count.
  it('moves its frame to the state, checks the load, and never goes back after the run', async () => {
    const { game, hook, frames, iterate } = setup()
    const loaded = new Uint8Array(MAIN_RAM_SIZE).fill(7)
    game.onLoad = (heap) => {
      heap.set(loaded)
    }
    const state = toBase64(Uint8Array.of(1))
    const stateSha = await sha256(loaded)
    hook.calls.queueRun(plan([{ kind: 'wait', frames: 3 }], { state, stateSha, startFrame: 5000 }))
    for (let i = 0; i < 17; i += 1) iterate()
    hook.calls.queueRun(plan([{ kind: 'wait', frames: 2 }]))
    for (let i = 0; i < 3; i += 1) iterate()
    expect(frames.slice(0, 15)).toEqual([
      ...Array.from({ length: 11 }, (_, i) => i),
      5000,
      5001,
      5002,
      5003,
    ])
    // Two frames with no run, then a run from boot's own count: the frame goes on all the same.
    expect(frames.slice(15)).toEqual([5004, 5005, 5006, 5007, 5008])
    await vi.waitFor(() => {
      expect(hook.calls.runReport().loadCheck).toMatch(/equals the mark's hash/)
    })
  })

  // Scene: the takeover writes through the pointer at the proc manager, and the park copies a
  // Pokémon from one party into the other, both behind pointers.
  it('applies a write and a copy behind pointers', () => {
    const { game, hook, iterate } = setup()
    setWord(game.heap, POINTER, OBJECT)
    setWord(game.heap, OBJECT + 0x10, OBJECT + 0x40)
    setWord(game.heap, OBJECT + 0x40, 0x44332211)
    const step: MacroStep = {
      kind: 'write',
      name: 'park',
      writes: [
        { kind: 'bytes', field: 'style', address: POINTER, hops: [0x08], bytes: [0x01] },
        {
          kind: 'copy',
          field: 'lead',
          from: { address: POINTER, hops: [0x10, 0] },
          to: { address: POINTER, hops: [0x20] },
          length: 4,
        },
      ],
    }
    hook.calls.queueRun(plan([step]))
    for (let i = 0; i < 2; i += 1) iterate()
    const at = (address: number) => game.heap[address - MAIN_RAM_START]
    expect(at(OBJECT + 0x08)).toBe(0x01)
    expect([0, 1, 2, 3].map((i) => at(OBJECT + 0x20 + i))).toEqual([0x11, 0x22, 0x33, 0x44])
    expect(hook.calls.runReport()).toMatchObject({
      status: 'done',
      watch: ['0: wrote style', '0: wrote lead'],
    })
  })

  // Scene: the game's heap moved an object, or the setup pointer is still null; the run must
  // stop at that write, say which field and hop led out, and write nothing after it.
  it('fails the run at a write whose chain leaves main RAM, and writes none of the later ones', () => {
    const { game, hook, iterate } = setup()
    const step: MacroStep = {
      kind: 'write',
      name: 'park',
      writes: [
        { kind: 'bytes', field: 'flag', address: FLAG, bytes: [0x5a] },
        { kind: 'bytes', field: 'name', address: POINTER, hops: [0x10, 0x04], bytes: [1] },
        { kind: 'bytes', field: 'other', address: OTHER, bytes: [0x22] },
      ],
    }
    hook.calls.queueRun(plan([{ kind: 'wait', frames: 1 }, step, write('later', VALUE, 7)]))
    for (let i = 0; i < 4; i += 1) iterate()
    const report = hook.calls.runReport()
    expect(report).toMatchObject({
      status: 'failed',
      step: 1,
      failed: 'step 1 "park" could not write name: hop 0 leads out of main RAM',
      watch: ['1: wrote flag'],
    })
    expect(report.marks.map((record) => record.name)).toEqual(['failed'])
    expect(game.heap[OTHER - MAIN_RAM_START]).toBe(0)
    expect(game.heap[VALUE - MAIN_RAM_START]).toBe(0)
  })

  // Scene: E-4 waits until the routine's stage, behind the block pointer, reads parked.
  it('waits on a value behind pointers', () => {
    const { game, hook, iterate } = setup()
    game.duringFrame = (frame, heap) => {
      if (frame === 1) setWord(heap, POINTER, OBJECT)
      if (frame === 2) setWord(heap, OBJECT + 0x30, OBJECT + 0x80)
      if (frame === 4) heap[OBJECT + 0x84 - MAIN_RAM_START] = 2
    }
    const until: MacroStep = {
      kind: 'until',
      name: 'parked',
      checks: [{ name: 'stage', address: POINTER, hops: [0x30, 0x04], width: 1, oneOf: [2] }],
      holdFor: 1,
      limit: 20,
    }
    hook.calls.queueRun(plan([until, write('go', FLAG, 1)]))
    for (let i = 0; i < 8; i += 1) iterate()
    expect(game.seen).toEqual([0, 0, 0, 0, 0, 1, 1, 1])
    expect(hook.calls.runReport().status).toBe('done')
  })
})
