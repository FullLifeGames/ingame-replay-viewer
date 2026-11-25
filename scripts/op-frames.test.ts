import { describe, expect, it } from 'vitest'

import {
  compareOpFrames,
  DEFAULT_THRESHOLD,
  formatOpFrames,
  OpClock,
  opFrameLog,
  parseOpFrames,
  sayOpFrames,
} from './op-frames.ts'
import type { OpFrameLog } from './op-frames.ts'

const OPS = ['intro', 'print', 'sendOut', 'move', 'print', 'end']

/** A log of OPS whose ops start on these frames, and END's finish on the last one. */
function log(engine: string, frames: readonly number[], ops = OPS, stream = 'hand-made') {
  const rows = ops.map((op, index) => ({ index, op, frame: frames[index] as number }))
  const finished = frames[ops.length]
  return { engine, stream, rows, ...(finished === undefined ? {} : { finished }) }
}

// mGBA boots 13 frames slower than the module; the module's sendOut then runs 16 frames longer.
const MGBA = log('mgba', [113, 120, 200, 300, 340, 400, 401])
const MODULE = log('module', [100, 107, 187, 303, 343, 403, 404])

describe('comparing the op frames of two engines', () => {
  it('names the first op whose start from the first op parts by more than the threshold', () => {
    const verdict = compareOpFrames(MGBA, MODULE)
    expect(verdict).toMatchObject({
      start: [113, 100],
      parting: { index: 3, op: 'move', frames: [300, 303], gap: 16, span: 'sendOut' },
      finished: [401, 404],
    })
  })

  it('names no op while every gap stays within the threshold, and still gives END', () => {
    const close = log('module', [100, 107, 187, 287 + DEFAULT_THRESHOLD, 327, 387, 389])
    const verdict = compareOpFrames(MGBA, close)
    expect(verdict).toMatchObject({ start: [113, 100], finished: [401, 389] })
    expect(verdict).not.toHaveProperty('parting')
    expect(sayOpFrames(MGBA, close, verdict).slice(1)).toEqual([
      `hand-made: no op parts by more than ${String(DEFAULT_THRESHOLD)} frames from op 0`,
      'hand-made: END at mgba 401, module 389: module 12 frames earlier, 1 frame later from op 0',
      `hand-made: the gap moves at 3 ops: sendOut 1 time, +${String(DEFAULT_THRESHOLD)}; move 1 time, -${String(DEFAULT_THRESHOLD)}; end 1 time, +1`,
    ])
  })

  it('counts each change of the gap against the op whose span holds it', () => {
    const verdict = compareOpFrames(MGBA, MODULE)
    expect(verdict).toMatchObject({ steps: [{ index: 3, span: 'sendOut', by: 16 }] })
  })

  it('says the parting op, both frames, the span before it and the gap at END', () => {
    const lines = sayOpFrames(MGBA, MODULE, compareOpFrames(MGBA, MODULE))
    expect(lines).toEqual([
      'hand-made: op 0 intro starts at mgba 113, module 100: module 13 frames earlier',
      `hand-made: first parting op 3 move (0x07) at mgba 300, module 303: module 16 frames later from op 0, over the threshold of ${String(DEFAULT_THRESHOLD)}; the span before it is op 2 sendOut`,
      'hand-made: END at mgba 401, module 404: module 3 frames later, 16 frames later from op 0',
      'hand-made: the gap moves at 1 op: sendOut 1 time, +16',
    ])
  })

  it('refuses logs of different lengths with their own line', () => {
    const short = log('module', [100, 107, 187, 303], OPS.slice(0, 4))
    expect(compareOpFrames(MGBA, short)).toEqual({
      problem: 'mgba logs 6 op starts, module 4: the runs did not play the same ops',
    })
  })

  it('refuses logs with another op at an index', () => {
    const other = log(
      'module',
      [100, 107, 187, 303, 343, 403, 404],
      [...OPS.slice(0, 3), 'hit', ...OPS.slice(4)],
    )
    expect(compareOpFrames(MGBA, other)).toEqual({
      problem: 'op 3 is move in mgba and hit in module: the logs are of different streams',
    })
  })

  it('refuses logs where only one run finished', () => {
    const unfinished = log('module', [100, 107, 187, 303, 343, 403])
    expect(compareOpFrames(MGBA, unfinished)).toEqual({
      problem: 'mgba finished at 401, module did not finish',
    })
  })

  it('refuses logs of different streams', () => {
    const other = { ...MODULE, stream: '994052' }
    expect(compareOpFrames(MGBA, other)).toEqual({
      problem: 'mgba logs hand-made, module logs 994052',
    })
  })

  it('says so when no op started in either run, as in a refused run', () => {
    const refused = (engine: string): OpFrameLog => ({ engine, stream: 'empty-slot', rows: [] })
    const verdict = compareOpFrames(refused('mgba'), refused('module'))
    expect(verdict).toEqual({ steps: [] })
    expect(sayOpFrames(refused('mgba'), refused('module'), verdict)).toEqual([
      'empty-slot: no op started in either run',
    ])
  })
})

describe('the op frame log', () => {
  it('writes a header with its version, a line per op and the finish, and reads them back', () => {
    const text = formatOpFrames(MGBA)
    expect(text.split('\n').slice(0, 3)).toEqual([
      'op-frames 1 mgba hand-made',
      '0 intro 113',
      '1 print 120',
    ])
    expect(text.endsWith('5 end 400\nfinished 401\n')).toBe(true)
    expect(parseOpFrames(text)).toEqual(MGBA)
  })

  it('refuses a log of another version or without its header', () => {
    expect(() => parseOpFrames('op-frames 2 mgba hand-made\n')).toThrow(
      'an op frame log of version 2; this compare reads version 1',
    )
    expect(() => parseOpFrames('0 intro 113\n')).toThrow('"0 intro 113" is no op frame log header')
  })

  it('refuses a line it cannot read and an op out of order', () => {
    expect(() => parseOpFrames('op-frames 1 mgba x\n0 intro\n')).toThrow('line 2: "0 intro"')
    expect(() => parseOpFrames('op-frames 1 mgba x\n1 intro 5\n')).toThrow(
      'line 2: op 1, expected op 0',
    )
  })

  it("names each start by the stream's op at its index, and the start past the last op as the finish", () => {
    const starts = [0, 1, 2].map((op) => ({ op, frame: 10 + op }))
    const head = { engine: 'module', stream: 's' }
    expect(opFrameLog(head, starts, ['intro', 'end'])).toEqual({
      ...head,
      rows: [
        { index: 0, op: 'intro', frame: 10 },
        { index: 1, op: 'end', frame: 11 },
      ],
      finished: 12,
    })
    expect(() => opFrameLog(head, [{ op: 3, frame: 9 }], ['end'])).toThrow(
      'op 3 started, the stream s has 1',
    )
  })
})

describe('the op clock', () => {
  const at = (done: number, playing = true) => ({ done, playing })

  it("notes each op on the first frame the interpreter plays with `done` at the op's index", () => {
    const clock = new OpClock()
    clock.note(at(0, false), 1)
    clock.note(at(0), 2)
    clock.note(at(0), 3)
    clock.note(at(1), 4)
    clock.note(at(3), 5)
    clock.note(at(3), 6)
    expect(clock.starts).toEqual([
      { op: 0, frame: 2 },
      { op: 1, frame: 4 },
      { op: 2, frame: 5 },
      { op: 3, frame: 5 },
    ])
  })
})
