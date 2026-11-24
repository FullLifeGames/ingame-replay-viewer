import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import type { ShotPlan } from './rom-shot.ts'
import { reportRun } from './rom-shot.ts'
import { INTERPRETER_HEADER_PATH, readErrorNames } from './rom-shot-run.ts'
import type { Fake, Script } from './wasm-run-fake.ts'
import { fakeModule, KEYS_UP, LAYOUT, playing, SLOT_LAYOUT } from './wasm-run-fake.ts'
import { finishStreams, playStreams } from './wasm-run-report.ts'
import type { StreamReport } from './wasm-run-report.ts'
import { playModule } from './wasm-run.ts'
import type { GameModule, ModuleHooks } from './wasm-run.ts'

const ERRORS = readErrorNames(readFileSync(INTERPRETER_HEADER_PATH, 'utf8'))
const HELD_B = KEYS_UP & ~0x0002
// Node's own trap class; the scripts' TypeScript library does not declare WebAssembly.
const { RuntimeError } = (
  globalThis as unknown as { WebAssembly: { RuntimeError: new (message: string) => Error } }
).WebAssembly

const plan = (name: string, stream: number[], holdBFrom?: number): ShotPlan => ({
  name,
  stream: Uint8Array.from(stream),
  scenes: [],
  missing: [],
  expect: 'finished',
  ...(holdBFrom === undefined ? {} : { holdBFrom }),
})

// The module's factory as Emscripten builds it: each call makes a new instance, here from the
// next script.
function instances(scripts: Script[]): {
  made: Fake[]
  factory: (hooks: ModuleHooks) => Promise<GameModule>
} {
  const made: Fake[] = []
  const factory = (hooks: ModuleHooks) => {
    const fake = fakeModule(scripts[made.length] as Script)
    made.push(fake)
    return fake.factory(hooks)
  }
  return { made, factory }
}

// Plays a plan in a module from the factory and reports it with its END, as wasm:run does.
function player(factory: (hooks: ModuleHooks) => Promise<GameModule>) {
  return async (shot: ShotPlan) => {
    const { stream, scenes, holdBFrom } = shot
    const run = await playModule(factory, { stream, scenes, layout: LAYOUT, holdBFrom })
    const report = reportRun({ plan: shot, ...run, errors: ERRORS, seconds: 0 })
    return { ...report, end: run.finishedAt }
  }
}

describe('a run of several streams (#66)', () => {
  it('goes on after a stream that traps: the next one plays in a fresh module to END', async () => {
    const end = { ...playing(34), finished: true }
    const modules = instances([
      (frame) => {
        if (frame === 4) throw new RuntimeError('divide by zero')
        return { progress: playing(1), colour: 0 }
      },
      (frame) => ({ progress: frame < 30 ? playing(1) : end, colour: 0 }),
    ])
    const plans = [plan('first', [1, 0, 0x22, 7, 9], 1), plan('second', [1, 0, 0x22])]
    await expect(playStreams(plans, player(modules.factory))).resolves.toMatchObject([
      {
        name: 'first',
        failure: { message: 'RuntimeError: divide by zero', frame: 3 },
        problems: ['the module trapped after 3 frames: RuntimeError: divide by zero'],
      },
      { name: 'second', end: 30, status: { status: 'finished', frame: 30 }, problems: [] },
    ])
    // Two instances: the trapped one held B and is never played again; the second starts with
    // every key up and its own stream in the slot.
    const [first, second] = modules.made as [Fake, Fake]
    expect(modules.made).toHaveLength(2)
    expect(first.keys).toEqual([HELD_B, HELD_B, HELD_B, HELD_B])
    expect(second.keys[0]).toBe(KEYS_UP)
    const slot = second.slotAtStart() as Uint8Array
    expect(new DataView(slot.buffer).getUint32(0x10, true)).toBe(3)
    const at = SLOT_LAYOUT.headerSize
    expect(Array.from(slot.subarray(at, at + 5))).toEqual([1, 0, 0x22, 0, 0])
  })

  it('reports a stream whose run fails without a trap with that error and no frame', async () => {
    const plans = [plan('hang', [1]), plan('next', [1])]
    const reports = await playStreams(plans, (shot) => {
      if (shot.name === 'hang')
        throw new Error('hang: no end after 900 s, a hang inside the module')
      return Promise.resolve({ ...plans[1], seconds: 1, scenes: [], problems: [] } as StreamReport)
    })
    expect(reports.map(({ name, failure }) => ({ name, failure }))).toEqual([
      { name: 'hang', failure: { message: 'hang: no end after 900 s, a hang inside the module' } },
      { name: 'next', failure: undefined },
    ])
  })
})

const scratch = mkdtempSync(join(tmpdir(), 'irv-run-report-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('the report of a run (#66)', () => {
  const status = {
    status: 'finished',
    frame: 3066,
    done: 34,
    total: 34,
    turn: 9,
    error: 0,
  } as const
  const played: StreamReport = {
    name: 'hand-made',
    expect: 'finished',
    seconds: 95.2,
    status,
    end: 2916,
    scenes: [{ name: 'first-hp', pass: true, detail: 'moved' }],
    missing: [],
    problems: [],
  }
  const trapped: StreamReport = {
    name: '995161',
    expect: 'finished',
    seconds: 12.3,
    scenes: [],
    missing: [],
    problems: ['the module trapped after 2635 frames: RuntimeError: divide by zero'],
    failure: { message: 'RuntimeError: divide by zero', frame: 2635 },
  }

  it('lists END or the failure per stream and ends on the count of passed and failed', () => {
    const lines: string[] = []
    const failed = finishStreams([played, trapped], scratch, (line) => lines.push(line))
    expect(failed).toBe(1)
    expect(lines).toEqual([
      'hand-made: passed, finished after 3066 frames, 34 of 34 done, 95.2 s',
      '  pass first-hp: moved',
      '  END at frame 2916',
      '995161: FAILED, the module trapped after 2635 frames: RuntimeError: divide by zero, 12.3 s',
      `1 of 2 streams passed, 1 failed (995161); frames and report.json in ${scratch}`,
    ])
    const report = JSON.parse(readFileSync(join(scratch, 'report.json'), 'utf8')) as unknown[]
    expect(report).toEqual([played, trapped])
  })

  it('counts every stream as passed when none failed', () => {
    const lines: string[] = []
    expect(finishStreams([played], scratch, (line) => lines.push(line))).toBe(0)
    expect(lines.at(-1)).toBe(`1 of 1 streams passed; frames and report.json in ${scratch}`)
  })

  it('says which streams the baseline lacks and counts them apart; they fail only on their own', () => {
    const lines: string[] = []
    const unbased = { ...played, name: 'hand-made-b', noBaseline: true } as const
    expect(finishStreams([played, unbased], scratch, (line) => lines.push(line))).toBe(0)
    expect(lines.slice(3)).toEqual([
      'hand-made-b: passed, finished after 3066 frames, 34 of 34 done, 95.2 s',
      '  pass first-hp: moved',
      '  END at frame 2916',
      '  no baseline: frames not compared',
      `2 of 2 streams passed, 1 with no baseline (hand-made-b); frames and report.json in ${scratch}`,
    ])
  })
})
