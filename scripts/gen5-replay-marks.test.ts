import { describe, expect, it } from 'vitest'

import type { MarkRecord } from '../src/gen5/hook.ts'
import { compareMarks, marksOf, pendingMarks, type RunMark } from './gen5-replay-marks.ts'

// Every frame and hash here is invented.

const A = 'ab'.repeat(32)
const B = 'cd'.repeat(32)

const record = (name: string, frame: number, ramSha?: string): MarkRecord => ({
  name,
  frame,
  pageFrame: frame + 10,
  wallMs: 1500,
  stateBytes: 0,
  values: 'near.slot0=0x1',
  ...(ramSha === undefined ? {} : { ramSha }),
})

describe('marksOf and pendingMarks', () => {
  it('keep each mark’s name, frame and hash, and name the marks whose hash is pending', () => {
    const marks = marksOf({ marks: [record('battle', 100, A), record('b1-answered', 1907)] })
    expect(marks).toEqual([
      { name: 'battle', frame: 100, hash: A },
      { name: 'b1-answered', frame: 1907, hash: undefined },
    ])
    expect(pendingMarks(marks)).toEqual(['b1-answered'])
  })
})

// Scene: two runs of the same replay (#110's fourth criterion) must agree on the emulated frame
// and the hash of main RAM at every mark; the pictures follow wall time and are not compared.
describe('compareMarks', () => {
  const battle: RunMark = { name: 'battle', frame: 100, hash: A }
  const b1: RunMark = { name: 'b1-answered', frame: 1907, hash: A }
  const first: RunMark[] = [battle, b1, { name: 'b2-answered', frame: 2213, hash: A }]

  it('finds two equal runs equal', () => {
    expect(
      compareMarks(
        first,
        first.map((one) => ({ ...one })),
      ),
    ).toEqual({
      equal: true,
      lines: ['marks: all 3 agree by frame and main RAM sha256'],
    })
  })

  it('names a mark at another frame and a mark with another hash', () => {
    const second = [
      battle,
      { name: 'b1-answered', frame: 1908, hash: A },
      { name: 'b2-answered', frame: 2213, hash: B },
    ]
    expect(compareMarks(first, second)).toEqual({
      equal: false,
      lines: [
        'marks: 2 of 3 differ',
        'mark b1-answered: frame 1907 here, 1908 in the other run',
        `mark b2-answered: main RAM sha256 ${A} here, ${B} in the other run`,
      ],
    })
  })

  it('names a mark missing in either run and a pending hash', () => {
    const second = [
      { name: 'battle', frame: 100, hash: undefined },
      b1,
      { name: 'b3-answered', frame: 2531, hash: A },
    ]
    expect(compareMarks(first, second)).toEqual({
      equal: false,
      lines: [
        'marks: 3 of 4 differ',
        'mark battle: main RAM sha256 pending in the other run',
        'mark b2-answered: missing in the other run',
        'mark b3-answered: missing in this run',
      ],
    })
  })

  it('tells apart two marks of one name by their order', () => {
    const twice = [battle, { name: 'battle', frame: 3307, hash: A }]
    expect(compareMarks(twice, [battle])).toEqual({
      equal: false,
      lines: ['marks: 1 of 2 differ', 'mark battle (2): missing in the other run'],
    })
  })

  it('names the first five differing marks and counts the rest', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ name: `m${String(i)}`, frame: i, hash: A }))
    const other = many.map((one) => ({ ...one, frame: one.frame + 1 }))
    const { equal, lines } = compareMarks(many, other)
    expect(equal).toBe(false)
    expect(lines).toEqual([
      'marks: 7 of 7 differ',
      ...many
        .slice(0, 5)
        .map(
          ({ name, frame }) =>
            `mark ${name}: frame ${String(frame)} here, ${String(frame + 1)} in the other run`,
        ),
      'and 2 more',
    ])
  })
})
