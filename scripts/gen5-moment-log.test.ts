import { describe, expect, it } from 'vitest'

import type { MarkRecord } from '../src/gen5/hook.ts'
import { markLines, writeLines, writeText } from './gen5-moment-log.ts'

// Every address, hop and hash here is invented.

const record = (name: string, frame: number, ramSha?: string): MarkRecord => ({
  name,
  frame,
  pageFrame: frame + 10,
  wallMs: 1500,
  stateBytes: 0,
  values: '',
  ...(ramSha === undefined ? {} : { ramSha }),
})

// Scene: two runs of the same command; the integrator compares their marks line by line.
describe('markLines', () => {
  it("gives each mark's frame and the hash of main RAM there", () => {
    expect(markLines([record('park', 245, 'ab'.repeat(32)), record('gone', 288)])).toEqual([
      `mark park: frame 245, main RAM sha256 ${'ab'.repeat(32)}`,
      'mark gone: frame 288, main RAM sha256 pending',
    ])
  })
})

describe('writeText and writeLines', () => {
  it('give the field, the fixed address, the hops and the bytes or bits', () => {
    expect(
      writeText({ kind: 'bytes', field: 'go', address: 0x2300034, bytes: [1, 0, 0x2a, 0] }),
    ).toBe('go @0x2300034 01 00 2a 00')
    expect(
      writeText({
        kind: 'bits',
        field: 'speed',
        address: 0x2300038,
        hops: [0x10, 4],
        mask: 0x1c,
        value: 12,
      }),
    ).toBe('speed @0x2300038 hops 0x10 0x4 bits 0x1c=12')
    expect(
      writeText({
        kind: 'copy',
        field: 'lead',
        from: { address: 0x2300000 },
        to: { address: 0x2300100 },
        length: 96,
      }),
    ).toBe('lead copy of 96 bytes')
  })

  it("prefix each write of a write step with the step's name and skip the other steps", () => {
    const lines = writeLines([
      { kind: 'wait', frames: 3 },
      {
        kind: 'write',
        name: 'go',
        writes: [{ kind: 'bytes', field: 'go', address: 16, bytes: [1] }],
      },
    ])
    expect(lines).toEqual(['step write go: go @0x10 01'])
  })
})
