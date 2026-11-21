import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  INTERPRETER_HEADER_PATH,
  judgeRun,
  PROGRESS_HEADER_PATH,
  progressAddress,
  readErrorNames,
  readProgressLayout,
  readToolOutput,
  toolBuildArgs,
} from './rom-shot-run.ts'
import { ROM_DIR } from './rom-config.ts'
import type { ToolOutput } from './rom-shot-run.ts'

const ERRORS = readErrorNames(readFileSync(INTERPRETER_HEADER_PATH, 'utf8'))

const finished: ToolOutput = {
  shots: [{ shot: 'intro', frame: 300, done: 1 }],
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

describe('the layout the shot tool reads', () => {
  it('comes from replay_progress.h: the size of struct ReplayProgress and the refusal colour', () => {
    expect(readProgressLayout(readFileSync(PROGRESS_HEADER_PATH, 'utf8'))).toEqual({
      size: 12,
      refusedColour: 0x630000,
    })
  })

  it('widens the five bits of the red channel to eight, as mGBA does', () => {
    const header = (red: string) =>
      `#define REPLAY_PROGRESS_SIZE 8\n#define REPLAY_REFUSED_RED ${red} // the backdrop\n`
    expect(readProgressLayout(header('31')).refusedColour).toBe(0xff0000)
    expect(readProgressLayout(header('0x01')).refusedColour).toBe(0x080000)
  })

  it('refuses a define that is missing or no plain number', () => {
    expect(() => readProgressLayout('#define REPLAY_REFUSED_RED 12\n')).toThrow(
      'replay_progress.h: REPLAY_PROGRESS_SIZE missing',
    )
    expect(() =>
      readProgressLayout('#define REPLAY_PROGRESS_SIZE 8\n#define REPLAY_REFUSED_RED (6 * 2)\n'),
    ).toThrow('replay_progress.h: REPLAY_REFUSED_RED is "(6 * 2)", not a plain number')
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
  it('is built from its one C file and our headers against libmgba', () => {
    expect(toolBuildArgs('/src/replay_shot.c', '/out/replay_shot')).toEqual([
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
      '-lmgba',
    ])
  })

  it('reports shots and a final status, one JSON object per line', () => {
    const text = [
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
      status: { status: 'error', frame: 44, done: 0, total: 0, turn: 0, error: 2 },
    }
    const scenes = [{ name: 'refused', pass: false, detail: 'one colour, 0xffffff, not 0x630000' }]
    expect(judgeRun({ expect: 'VERSION', output, scenes, errors: ERRORS })).toEqual([
      'scene refused: one colour, 0xffffff, not 0x630000',
    ])
  })
})
