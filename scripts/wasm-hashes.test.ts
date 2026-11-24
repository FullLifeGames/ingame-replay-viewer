import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import {
  compareRuns,
  differingLines,
  firstDifference,
  frameLines,
  HashLog,
  parseRunArgs,
  readHashes,
  saveBaseline,
  settleBaseline,
  startBaseline,
  writeHashes,
} from './wasm-hashes.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-hashes-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const FRAME_BYTES = 240 * 160 * 2

/** A frame of one colour, with the colours of the named lines changed. */
function frame(colour: number, changed: Record<number, number> = {}): Uint8Array {
  const words = new Uint16Array(240 * 160).fill(colour)
  for (const [line, value] of Object.entries(changed)) {
    words.fill(value, Number(line) * 240, (Number(line) + 1) * 240)
  }
  return new Uint8Array(words.buffer)
}

function log(...frames: Uint8Array[]): HashLog {
  const hashes = new HashLog()
  for (const bytes of frames) hashes.add(bytes)
  return hashes
}

describe('the hash log of a run', () => {
  it('holds 160 line hashes per frame, and equal frames hash alike', () => {
    const hashes = log(frame(1), frame(1), frame(2)).done()
    expect(hashes.frames).toBe(3)
    expect(frameLines(hashes, 1)).toEqual(frameLines(hashes, 2))
    expect(frameLines(hashes, 1)).not.toEqual(frameLines(hashes, 3))
    expect(frameLines(hashes, 1)).toHaveLength(160)
  })

  it('refuses a frame of another size', () => {
    expect(() => {
      new HashLog().add(new Uint8Array(FRAME_BYTES - 2))
    }).toThrow(/76800 bytes/)
  })

  it('names frames from 1, as the run counts them', () => {
    const hashes = log(frame(1)).done()
    expect(() => frameLines(hashes, 0)).toThrow(/frame 0/)
    expect(() => frameLines(hashes, 2)).toThrow(/1 frames/)
  })

  it('reads back what it wrote', () => {
    const path = join(scratch, 'run.crc')
    const hashes = log(frame(1), frame(5, { 7: 9 })).done()
    writeHashes(path, hashes)
    expect(readHashes(path)).toEqual(hashes)
  })

  it('refuses a file cut inside a frame', () => {
    const path = join(scratch, 'cut.crc')
    writeFileSync(path, new Uint8Array(160 * 4 + 4))
    expect(() => readHashes(path)).toThrow(/cut\.crc.*not a whole number of frames/)
  })

  it('grows past its first buffer', () => {
    const hashes = new HashLog()
    for (let i = 0; i < 70; i++) hashes.add(frame(i))
    expect(hashes.done().frames).toBe(70)
  })
})

describe('the first difference of two runs', () => {
  it('names the differing lines of two frames', () => {
    const a = log(frame(1)).done()
    const b = log(frame(1, { 0: 3, 42: 3, 159: 3 })).done()
    expect(differingLines(frameLines(a, 1), frameLines(b, 1))).toEqual([0, 42, 159])
  })

  it('is none for equal runs', () => {
    expect(firstDifference(log(frame(1), frame(2)).done(), log(frame(1), frame(2)).done())).toBe(
      undefined,
    )
  })

  it('names the first frame that differs and its lines', () => {
    const base = log(frame(1), frame(2), frame(3)).done()
    const run = log(frame(1), frame(2, { 10: 0 }), frame(4)).done()
    expect(firstDifference(base, run)).toEqual({ frame: 2, lines: [10] })
  })

  it('names the frame after the shorter run when one run is a prefix of the other', () => {
    const base = log(frame(1), frame(2)).done()
    expect(firstDifference(base, log(frame(1)).done())).toEqual({ frame: 2, lines: [] })
  })
})

describe('a run against the baseline', () => {
  it('passes when every frame equals the baseline', () => {
    const hashes = log(frame(1), frame(2)).done()
    expect(compareRuns('hand-made', hashes, hashes)).toEqual({
      name: 'hand-made',
      frames: { baseline: 2, run: 2 },
      problems: [],
    })
  })

  it('names the first differing frame, its lines and the frame counts', () => {
    const base = log(frame(1), frame(2), frame(3)).done()
    const run = log(frame(1), frame(2, { 3: 0, 4: 0 })).done()
    expect(compareRuns('994052', base, run)).toEqual({
      name: '994052',
      frames: { baseline: 3, run: 2 },
      first: { frame: 2, lines: [3, 4] },
      problems: [
        '994052: 2 frames, the baseline 3',
        '994052: frame 2 differs from the baseline in 2 lines (3-4)',
      ],
    })
  })
})

describe('the arguments of wasm:run', () => {
  it('plays without a baseline by default', () => {
    expect(parseRunArgs(['hand-made'])).toEqual({ mode: 'plain', names: ['hand-made'] })
  })

  it('takes --baseline and --against-baseline, but not both', () => {
    expect(parseRunArgs(['--baseline', 'hand-made', '994052'])).toEqual({
      mode: 'baseline',
      names: ['hand-made', '994052'],
    })
    expect(parseRunArgs(['--against-baseline'])).toEqual({ mode: 'against', names: [] })
    expect(() => parseRunArgs(['--baseline', '--against-baseline'])).toThrow(/one of/)
  })

  it('plays every test replay after the named streams with --all (#66)', () => {
    expect(parseRunArgs(['--all', 'hand-made'])).toEqual({
      mode: 'plain',
      names: ['hand-made'],
      all: true,
    })
    expect(parseRunArgs(['--against-baseline', '--all'])).toEqual({
      mode: 'against',
      names: [],
      all: true,
    })
  })

  it('plays the sanitized module with --sanitize, against the baseline but never saving one', () => {
    expect(parseRunArgs(['--sanitize', 'shift', 'hand-made'])).toEqual({
      mode: 'plain',
      names: ['hand-made'],
      sanitize: 'shift',
    })
    expect(parseRunArgs(['--against-baseline', '--sanitize', 'shift'])).toMatchObject({
      mode: 'against',
      sanitize: 'shift',
    })
    expect(() => parseRunArgs(['--baseline', '--sanitize', 'shift'])).toThrow(/sanitized/)
    expect(() => parseRunArgs(['--sanitize', 'address'])).toThrow(/address/)
  })
})

describe('the baseline', () => {
  function outDir(): string {
    const out = mkdtempSync(join(scratch, 'out-'))
    writeFileSync(join(out, 'irv-emerald.js'), 'js')
    writeFileSync(join(out, 'irv-emerald.wasm'), 'wasm')
    return out
  }

  it('copies the module into build/wasm/baseline', () => {
    const out = outDir()
    const dir = saveBaseline(out)
    expect(dir).toBe(join(out, 'baseline'))
    expect(readFileSync(join(dir, 'irv-emerald.js'), 'utf8')).toBe('js')
    expect(readFileSync(join(dir, 'irv-emerald.wasm'), 'utf8')).toBe('wasm')
  })

  it('refuses to overwrite a baseline', () => {
    const out = outDir()
    mkdirSync(join(out, 'baseline'))
    expect(() => saveBaseline(out)).toThrow(/baseline.*exists/)
  })

  it('refuses without a module', () => {
    const out = mkdtempSync(join(scratch, 'empty-'))
    expect(() => saveBaseline(out)).toThrow(/irv-emerald\.js/)
  })
})

describe('the baseline around the runs', () => {
  function outWithModule(): string {
    const out = mkdtempSync(join(scratch, 'around-'))
    writeFileSync(join(out, 'irv-emerald.js'), 'js')
    writeFileSync(join(out, 'irv-emerald.wasm'), 'wasm')
    return out
  }

  function runFile(out: string, ...frames: Uint8Array[]): string {
    const path = join(out, 'lines.crc')
    writeHashes(path, log(...frames).done())
    return path
  }

  it('saves the module before --baseline runs and each run into it after', () => {
    const out = outWithModule()
    startBaseline('baseline', out, [{ name: 'hand-made' }])
    expect(existsSync(join(out, 'baseline', 'irv-emerald.wasm'))).toBe(true)
    const settled = settleBaseline({ mode: 'baseline', out }, 'hand-made', runFile(out, frame(1)))
    expect(settled).toEqual({ problems: [] })
    expect(readHashes(join(out, 'baseline', 'hand-made.crc')).frames).toBe(1)
  })

  it('refuses --against-baseline before any run when the baseline holds none of the streams', () => {
    const out = outWithModule()
    mkdirSync(join(out, 'baseline'))
    expect(() => {
      startBaseline('against', out, [{ name: 'hand-made' }, { name: '994052' }])
    }).toThrow(/no baseline for hand-made, 994052.*--baseline/)
  })

  it('compares the streams the baseline holds and reports the others as without one (W5-38)', () => {
    const out = outWithModule()
    mkdirSync(join(out, 'baseline'))
    writeHashes(join(out, 'baseline', 'hand-made.crc'), log(frame(1)).done())
    const streams = [{ name: 'hand-made' }, { name: 'hand-made-b' }]
    expect(() => {
      startBaseline('against', out, streams)
    }).not.toThrow()
    const against = { mode: 'against', out } as const
    expect(settleBaseline(against, 'hand-made-b', runFile(out, frame(2)))).toEqual({
      problems: [],
      noBaseline: true,
    })
    expect(settleBaseline(against, 'hand-made', runFile(out, frame(2))).problems).toHaveLength(1)
  })

  it('holds a run against its baseline and names what differs', () => {
    const out = outWithModule()
    mkdirSync(join(out, 'baseline'))
    writeHashes(join(out, 'baseline', 'hand-made.crc'), log(frame(1), frame(2)).done())
    const against = { mode: 'against', out } as const
    expect(settleBaseline(against, 'hand-made', runFile(out, frame(1), frame(2)))).toEqual({
      problems: [],
      equal: 'hand-made: 2 frames, every frame equal to the baseline',
    })
    const differs = settleBaseline(against, 'hand-made', runFile(out, frame(3))).problems
    expect(differs).toEqual([
      'hand-made: 1 frames, the baseline 2',
      'hand-made: frame 1 differs from the baseline in 160 lines (0-159)',
    ])
  })

  it('does nothing in a plain run', () => {
    const out = outWithModule()
    startBaseline('plain', out, [{ name: 'hand-made' }])
    expect(settleBaseline({ mode: 'plain', out }, 'hand-made', runFile(out, frame(1)))).toEqual({
      problems: [],
    })
    expect(existsSync(join(out, 'baseline'))).toBe(false)
  })
})
