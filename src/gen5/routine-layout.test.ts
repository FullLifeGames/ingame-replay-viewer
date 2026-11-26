import { describe, expect, it } from 'vitest'

import { blockAddress, checkLayout, routineLayout, type RoutineLayout } from './routine-layout'
import { orderOffset } from './routine-order'

// Every span, size and address here is invented for the spec.

const SPAN = { start: 0x02300000, end: 0x02300400 }
const SIZES = { code: 0x86, table: 12, block: 0x40, fieldStatus: 0x0e }
const BOOT = { ov004: { start: 0x02280000, end: 0x02300000 } }

// Scene: the routine lives in the battle overlay's span until the battle loads there, its pieces
// apart, each word-aligned, none in an overlay the boot has loaded.
describe('routineLayout', () => {
  it('lays the code, the table, the block and the status room out in a row, word-aligned', () => {
    expect(routineLayout(SPAN, SIZES, BOOT)).toEqual({
      code: { start: 0x02300000, end: 0x02300086 },
      table: { start: 0x02300088, end: 0x02300094 },
      block: { start: 0x02300094, end: 0x023000d4 },
      fieldStatus: { start: 0x023000d4, end: 0x023000e2 },
    })
  })

  it('starts at the first word of a span that starts between words', () => {
    const layout = routineLayout({ ...SPAN, start: 0x02300002 }, SIZES, BOOT)
    expect(layout.code.start).toBe(0x02300004)
  })

  it('throws when the pieces do not fit the span, naming the piece that leaves it', () => {
    const span = { ...SPAN, end: 0x023000e0 }
    expect(() => routineLayout(span, SIZES, BOOT)).toThrow(
      "the routine's fieldStatus leaves the battle overlay's span",
    )
  })

  it('throws when a piece meets a boot overlay, naming both', () => {
    const boot = { ...BOOT, ov031: { start: 0x023000a0, end: 0x02300200 } }
    expect(() => routineLayout(SPAN, SIZES, boot)).toThrow(
      "the routine's block meets the boot overlay ov031",
    )
  })

  it('throws on a piece of no bytes', () => {
    expect(() => routineLayout(SPAN, { ...SIZES, code: 0 }, BOOT)).toThrow(
      "the routine's code has no bytes",
    )
  })
})

const LAID: RoutineLayout = routineLayout(SPAN, SIZES, BOOT)

describe('checkLayout', () => {
  it('passes the laid-out pieces', () => {
    expect(() => {
      checkLayout(LAID, SPAN, BOOT)
    }).not.toThrow()
  })

  it('throws when two pieces overlap, naming both', () => {
    const layout = { ...LAID, block: { start: 0x02300090, end: 0x023000d0 } }
    expect(() => {
      checkLayout(layout, SPAN, BOOT)
    }).toThrow("the routine's table and block overlap")
  })

  it('throws on a piece between words', () => {
    const layout = { ...LAID, fieldStatus: { start: 0x023000d6, end: 0x023000e4 } }
    expect(() => {
      checkLayout(layout, SPAN, BOOT)
    }).toThrow("the routine's fieldStatus does not start on a word")
  })

  it('throws on a piece before the span', () => {
    const layout = { ...LAID, code: { start: 0x022ffff0, end: 0x02300076 } }
    expect(() => {
      checkLayout(layout, SPAN, {})
    }).toThrow("the routine's code leaves the battle overlay's span")
  })
})

describe('blockAddress', () => {
  it("gives a member's address inside the block", () => {
    expect(blockAddress(LAID, 'setup')).toBe(0x02300094 + orderOffset('setup'))
  })
})
