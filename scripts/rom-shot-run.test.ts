import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  INTERPRETER_HEADER_PATH,
  judgeRun,
  progressAddress,
  readErrorNames,
  readToolOutput,
  TOOL_CLOCK,
  TOOL_SOURCES,
  toolArgs,
  toolBuildArgs,
} from './rom-shot-run.ts'
import { ROM_DIR } from './rom-config.ts'
import type { ToolOutput } from './rom-shot-run.ts'

const ERRORS = readErrorNames(readFileSync(INTERPRETER_HEADER_PATH, 'utf8'))

const finished: ToolOutput = {
  shots: [{ shot: 'intro', frame: 300, done: 1 }],
  ops: [
    { op: 0, frame: 290 },
    { op: 1, frame: 295 },
  ],
  status: { status: 'finished', frame: 4000, done: 31, total: 31, turn: 2, error: 0 },
}

describe('the names of the interpreter errors', () => {
  it('reads enum ReplayError from replay_interpreter.h in order', () => {
    expect(ERRORS.slice(0, 3)).toEqual(['NONE', 'EMPTY', 'VERSION'])
    expect(ERRORS).toContain('TEAM')
  })

  it('refuses a header without the enum', () => {
    expect(() => readErrorNames('enum Other { A };')).toThrow('enum ReplayError missing')
  })

  it('refuses an enum entry with its own value, which would shift the numbers', () => {
    expect(() => readErrorNames('enum ReplayError\n{\n    REPLAY_ERROR_NONE = 3,\n};')).toThrow(
      'REPLAY_ERROR_NONE = 3',
    )
  })
})

describe('the address of gReplayProgress', () => {
  it('comes from nm with the size of struct ReplayProgress', () => {
    expect(progressAddress('gReplayProgress b 0203f2a0 00000008\n', 8)).toBe(0x0203f2a0)
  })

  it('refuses a symbol of another size', () => {
    expect(() => progressAddress('gReplayProgress b 0203f2a0 0000000a\n', 8)).toThrow(
      'gReplayProgress has 10 bytes, the shot tool reads 8',
    )
  })

  it('says the ROM has no replay boot when the symbol is missing', () => {
    expect(() => progressAddress('gReplaySlot T 08003000 00020000\n', 8)).toThrow(
      'gReplayProgress not in the ELF',
    )
  })
})

describe('the shot tool', () => {
  it('is built from its C files and our headers against libmgba', () => {
    expect(TOOL_SOURCES.map((source) => source.slice(ROM_DIR.length + 1))).toEqual([
      'shot/replay_shot.c',
      'shot/replay_state.c',
    ])
    expect(
      toolBuildArgs(['/src/replay_shot.c', '/src/replay_state.c'], '/out/replay_shot'),
    ).toEqual([
      '-std=gnu11',
      '-O2',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-I',
      join(ROM_DIR, 'include'),
      '-o',
      '/out/replay_shot',
      '/src/replay_shot.c',
      '/src/replay_state.c',
      '-lmgba',
    ])
  })

  const clock = ['--clock', String(TOOL_CLOCK)]

  it('takes the ROM, the address in hex, the frame folder, the clock and the shots', () => {
    const run = { tool: 't', rom: 'r.gba', address: 0x2024abc, frameDir: 'f', shots: ['a:1:2'] }
    expect(toolArgs(run)).toEqual(['r.gba', '0x2024abc', 'f', ...clock, 'a:1:2'])
  })

  it('asks for a video state every N frames before the shots, for the mGBA oracle', () => {
    const run = { tool: 't', rom: 'r.gba', address: 16, frameDir: 'f', shots: [], stateEvery: 60 }
    expect(toolArgs(run)).toEqual(['r.gba', '0x10', 'f', ...clock, '--state-every', '60'])
  })

  it('holds B from frame N on only for a run that asks for it (#68)', () => {
    const run = { tool: 't', rom: 'r.gba', address: 16, frameDir: 'f', shots: ['a:1:2'] }
    expect(toolArgs({ ...run, holdBFrom: 1 })).toEqual([
      'r.gba',
      '0x10',
      'f',
      ...clock,
      '--hold-b-from',
      '1',
      'a:1:2',
    ])
    expect(toolArgs(run)).not.toContain('--hold-b-from')
  })

  it("fixes mGBA's cartridge clock at the module's time, so that two runs play alike", () => {
    const stubs = readFileSync(join(ROM_DIR, 'wasm', 'src', 'irv_wasm_stubs.c'), 'utf8')
    const fixed = /sFixedTime =\s*\{([^}]*)\}/.exec(stubs)?.[1] ?? ''
    const bcd = (field: string) => {
      const digits = new RegExp(`\\.${field} = 0x(\\d\\d)`).exec(fixed)?.[1]
      if (digits === undefined) throw new Error(`sFixedTime has no ${field}`)
      return Number(digits)
    }
    const fields = ['year', 'month', 'day', 'hour', 'minute', 'second'].map(bcd)
    const [year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0] = fields
    const module = Date.UTC(2000 + year, month - 1, day, hour, minute, second) / 1000
    expect(TOOL_CLOCK).toBe(module)
  })

  it('reports shots, op starts and a final status, one JSON object per line', () => {
    const text = [
      '{"op":0,"frame":290}',
      '{"op":1,"frame":295}',
      '{"shot":"intro","frame":300,"done":1}',
      '{"status":"finished","frame":4000,"done":31,"total":31,"turn":2,"error":0}',
      '',
    ].join('\n')
    expect(readToolOutput(text)).toEqual(finished)
  })

  it('refuses output without a final status', () => {
    expect(() => readToolOutput('{"shot":"intro","frame":300,"done":1}\n')).toThrow(
      'the shot tool ended without a status',
    )
  })
})

describe('judging a run', () => {
  const passing = [{ name: 'intro', pass: true, detail: '5 pixels differ' }]

  it('passes a replay that finished every instruction with every scene passing', () => {
    expect(
      judgeRun({ expect: 'finished', output: finished, scenes: passing, errors: ERRORS }),
    ).toEqual([])
  })

  it('fails a replay that lacks a scene it must have', () => {
    expect(
      judgeRun({
        expect: 'finished',
        output: finished,
        scenes: passing,
        errors: ERRORS,
        missing: ['first-faint', 'held'],
      }),
    ).toEqual([
      'missing scene first-faint: the stream has none',
      'missing scene held: the stream has none',
    ])
  })

  it('names a stall, a failed scene and an unfinished count', () => {
    const output: ToolOutput = {
      shots: [],
      ops: [],
      status: { status: 'stall', frame: 9000, done: 7, total: 31, turn: 1, error: 0 },
    }
    const scenes = [{ name: 'win', pass: false, detail: 'no frame "win"' }]
    expect(judgeRun({ expect: 'finished', output, scenes, errors: ERRORS })).toEqual([
      'status stall, expected finished',
      '7 of 31 instructions done',
      'scene win: no frame "win"',
    ])
  })

  it('passes a refusal with the expected error and fails another one', () => {
    const output: ToolOutput = {
      shots: [],
      ops: [],
      status: { status: 'error', frame: 2, done: 0, total: 0, turn: 0, error: 1 },
    }
    expect(judgeRun({ expect: 'EMPTY', output, scenes: [], errors: ERRORS })).toEqual([])
    expect(judgeRun({ expect: 'VERSION', output, scenes: [], errors: ERRORS })).toEqual([
      'error EMPTY, expected VERSION',
    ])
  })

  it('fails a refusal whose last frame is not the refusal screen', () => {
    const output: ToolOutput = {
      shots: [],
      ops: [],
      status: { status: 'error', frame: 44, done: 0, total: 0, turn: 0, error: 2 },
    }
    const scenes = [{ name: 'refused', pass: false, detail: '0 text pixels on 0x630000' }]
    expect(judgeRun({ expect: 'VERSION', output, scenes, errors: ERRORS })).toEqual([
      'scene refused: 0 text pixels on 0x630000',
    ])
  })
})
