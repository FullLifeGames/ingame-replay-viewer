import { describe, expect, it } from 'vitest'

import { HASH_POLLS, marksFile, marksVerdict, runExit } from './gen5-replay-exit.ts'
import type { RunMark } from './gen5-replay-marks.ts'

// Every frame and hash here is invented.

const A = 'ab'.repeat(32)
const B = 'cd'.repeat(32)

const battle: RunMark = { name: 'battle', frame: 100, hash: A }
const marks: RunMark[] = [battle, { name: 'b1-answered', frame: 190, hash: B }]

describe('marksFile', () => {
  it('gives the marks of an earlier run’s file', () => {
    const text = JSON.stringify({ label: 'r1', status: 'done', marks })
    expect(marksFile(text, 'runs/r1.json')).toEqual(marks)
  })

  it('refuses a file with no marks by its path', () => {
    const text = JSON.stringify({ label: 'r1', status: 'done' })
    expect(() => marksFile(text, 'runs/r1.json')).toThrow('runs/r1.json holds no marks of a run')
  })
})

describe('marksVerdict', () => {
  it('fails on a hash still pending, naming the mark', () => {
    const pending = [battle, { name: 'end', frame: 220, hash: undefined }]
    expect(marksVerdict(pending, undefined)).toEqual({
      agree: false,
      lines: [`marks: main RAM sha256 pending after ${String(HASH_POLLS)} polls: end`],
    })
  })

  it('fails on a mark that differs from the earlier run’s', () => {
    const other = [battle, { name: 'b1-answered', frame: 191, hash: B }]
    const verdict = marksVerdict(marks, other)
    expect(verdict.agree).toBe(false)
    expect(verdict.lines).toEqual([
      'marks: 1 of 2 differ',
      'mark b1-answered: frame 190 here, 191 in the other run',
    ])
  })

  it('passes with no hash pending and no earlier run', () => {
    expect(marksVerdict(marks, undefined)).toEqual({ agree: true, lines: [] })
  })

  it('passes when every mark agrees with the earlier run’s', () => {
    expect(marksVerdict(marks, [...marks])).toEqual({
      agree: true,
      lines: ['marks: all 2 agree by frame and main RAM sha256'],
    })
  })
})

describe('runExit', () => {
  it('gives 0 only for a finished run whose parties and marks agree', () => {
    expect(runExit({ status: 'done', party: true, marks: true })).toBe(0)
    expect(runExit({ status: 'failed', party: true, marks: true })).toBe(1)
    expect(runExit({ status: 'running', party: true, marks: true })).toBe(1)
    expect(runExit({ status: 'done', party: false, marks: true })).toBe(1)
    expect(runExit({ status: 'done', party: true, marks: false })).toBe(1)
  })
})
