import { describe, expect, it } from 'vitest'

import { ENTRY, ROUTINE } from './direct-entry.fixtures'
import { takeover } from './direct-takeover'
import { macroPlayer, type MacroStep } from './macro'
import type { ReadRam } from './ram-check'
import type { MemoryWrite } from './ram-write'
import { orderOffset, ROUTINE_STAGES } from './routine-order'

// Every address, offset, size and constant here is invented (direct-entry.fixtures.ts).

const MANAGER = 0x02140000
const CODE = 0x02300000
const TABLE = 0x02300024
const BLOCK = 0x02300030
const STATUS = 0x02300070

const { steps, layout } = takeover(ENTRY, ROUTINE)

const fieldOf = (write: MemoryWrite | undefined) => write?.field

// Scene: the boot proc queues its boot screens, and in the frame boundary before the switch the
// page swaps our routine in for them; the routine then builds the battle and waits at the park.
describe('takeover', () => {
  it('lays the routine out at the start of the battle overlay', () => {
    expect(layout.code).toEqual({ start: CODE, end: CODE + 0x24 })
    expect(layout.table.start).toBe(TABLE)
    expect(layout.block.start).toBe(BLOCK)
    expect(layout.fieldStatus).toEqual({ start: STATUS, end: STATUS + 0x0e })
  })

  it("waits for the boot screens' queue, then writes in the step right after it", () => {
    const [window, write] = steps
    expect(window).toMatchObject({ kind: 'until', name: 'takeover-window', holdFor: 1 })
    expect(write).toMatchObject({ kind: 'write', name: 'takeover' })
  })

  it("checks the queue through the manager's pointer: queued, the boot screens' table and param", () => {
    const [window] = steps
    const checks = window?.kind === 'until' ? window.checks : []
    const hops = (name: string) => checks.find((check) => check.name === name)?.hops
    expect(checks.map((check) => check.name)).toEqual([
      'manager.queued',
      'manager.nextFunctions',
      'manager.nextParam',
    ])
    expect(checks.every((check) => check.address === 0x02110000)).toBe(true)
    expect(hops('manager.queued')).toEqual([0x0c])
    expect(checks[0]?.noneOf).toEqual([0])
    expect(checks[1]?.oneOf).toEqual([0x02200000])
    expect(checks[2]?.oneOf).toEqual([0x02110010])
  })

  it("writes the code, the table, the block, then the manager's three next words last", () => {
    const write = steps[1]
    const writes = write?.kind === 'write' ? write.writes : []
    expect(writes.map(fieldOf)).toEqual([
      'routine code',
      'routine table',
      'routine block',
      'manager.nextOverlayId',
      'manager.nextFunctions',
      'manager.nextParam',
    ])
    expect(writes[0]).toMatchObject({ address: CODE, bytes: ROUTINE.bytes })
    expect(writes[1]).toMatchObject({
      address: TABLE,
      bytes: [0x01, 0, 0x30, 0x02, 0x11, 0, 0x30, 0x02, 0x21, 0, 0x30, 0x02],
    })
    expect(writes[3]).toMatchObject({
      address: 0x02110000,
      hops: [0x14],
      bytes: [255, 255, 255, 255],
    })
    expect(writes[4]).toMatchObject({ hops: [0x18], bytes: [0x24, 0, 0x30, 0x02] })
    expect(writes[5]).toMatchObject({ hops: [0x1c], bytes: [0x30, 0, 0x30, 0x02] })
  })

  it("fills the block with stage, go, gameData and setup at 0 and the page's values", () => {
    const write = steps[1]
    const block = write?.kind === 'write' ? write.writes[2] : undefined
    const bytes = block?.kind === 'bytes' ? block.bytes : []
    const word = (member: Parameters<typeof orderOffset>[0]) => {
      const at = orderOffset(member)
      return (bytes[at] ?? 0) + (bytes[at + 1] ?? 0) * 0x100 + (bytes[at + 2] ?? 0) * 0x10000
    }
    expect(bytes).toHaveLength(64)
    expect(['stage', 'go', 'gameData', 'setup'].map((m) => word(m as 'go'))).toEqual([0, 0, 0, 0])
    expect(word('gameDataCreate')).toBe(0x004201)
    expect(word('heapId')).toBe(7)
    expect(word('battleOverlayId')).toBe(99)
    expect(word('battleProcFunctions')).toBe(0x300800)
    expect(word('bgmOffset')).toBe(0x0a)
    expect(word('fieldStatus')).toBe(0x300070)
  })

  it('marks takeover and park, each after a check of the routine, and ends at park', () => {
    const names = steps.map((step) => ('name' in step ? `${step.kind} ${step.name}` : step.kind))
    expect(names).toEqual([
      'until takeover-window',
      'write takeover',
      'until takeover-region',
      'mark takeover',
      'until routine-stage',
      'until noGameData',
      'until noSetup',
      'until park-region',
      'mark park',
    ])
  })

  it('gives the checks of its region, the same at the takeover and at the park', () => {
    const { region } = takeover(ENTRY, ROUTINE)
    const checksOf = (name: string) => {
      const step = steps.find((one) => one.kind === 'until' && one.name === name)
      return step?.kind === 'until' ? step.checks : []
    }
    expect(checksOf('takeover-region')).toEqual(region)
    expect(checksOf('park-region')).toEqual(region)
  })

  // E-5's two runs measured the window at frame 216 from power-on and the park 29 frames after the
  // takeover; the limits leave about twice and three times that.
  it('waits for the window and the park within limits fitted to the measured frames', () => {
    const limitOf = (name: string) =>
      steps.find((step) => step.kind === 'until' && step.name === name)
    expect(limitOf('takeover-window')).toMatchObject({ limit: 450 })
    expect(limitOf('routine-stage')).toMatchObject({ limit: 90 })
  })

  it('checks a code tail short of a word byte by byte', () => {
    const odd = { ...ROUTINE, bytes: [...ROUTINE.bytes, 0x5a], size: 0x25 }
    const region = takeover(ENTRY, odd).steps[2]
    const checks = region?.kind === 'until' ? region.checks : []
    expect(checks.find((check) => check.address === CODE + 0x24)).toMatchObject({
      width: 1,
      oneOf: [0x5a],
    })
  })

  it("throws on a proc manager's next word that is no word", () => {
    const manager = ENTRY.layouts.GameProcManager
    const fields = { ...manager?.fields, nextParam: { offset: 0x1c, size: 2 } }
    const layouts = { ...ENTRY.layouts, GameProcManager: { size: 0x20, align: 4, fields } }
    expect(() => takeover({ ...ENTRY, layouts }, ROUTINE)).toThrow(
      "the proc manager's nextParam is no word",
    )
  })

  it('throws on a build whose order differs from the block', () => {
    expect(() => takeover(ENTRY, { ...ROUTINE, order: ['stage'] })).toThrow(/order/)
  })
})

/** Main RAM as a map of bytes, read as the page reads it. */
function ram(): { read: ReadRam; put: (address: number, bytes: readonly number[]) => void } {
  const bytes = new Map<number, number>()
  const put = (address: number, values: readonly number[]) => {
    values.forEach((value, i) => bytes.set(address + i, value))
  }
  const read: ReadRam = (address, width) => {
    let value = 0
    for (let i = width - 1; i >= 0; i -= 1) value = value * 256 + (bytes.get(address + i) ?? 0)
    return value
  }
  return { read, put }
}

const le = (value: number) => [0, 8, 16, 24].map((shift) => (value >>> shift) & 0xff)

/** Plays `plan` frame by frame on `memory`, applying each fixed bytes write; `game` changes the
 * memory after each frame. Gives the marks and the end. */
function play(
  plan: readonly MacroStep[],
  memory: ReturnType<typeof ram>,
  game: (frame: number) => void,
) {
  const player = macroPlayer(plan)
  const marks: string[] = []
  for (let frame = 0; frame < 2000; frame += 1) {
    const input = player.next(memory.read)
    marks.push(...input.marks)
    if (input.done) return { marks, failed: input.failed }
    for (const write of input.writes ?? []) {
      if (write.kind === 'bytes' && !write.hops) memory.put(write.address, write.bytes)
    }
    game(frame)
  }
  return { marks, failed: 'ran out of frames' }
}

describe('the takeover plan, played', () => {
  const boot = (memory: ReturnType<typeof ram>) => {
    memory.put(0x02110000, le(MANAGER))
    memory.put(MANAGER + 0x0c, le(1))
    memory.put(MANAGER + 0x18, le(0x02200000))
    memory.put(MANAGER + 0x1c, le(0x02110010))
  }
  const stageAt = BLOCK + orderOffset('stage')

  it('ends at park once the routine reads parked', () => {
    const memory = ram()
    const result = play(steps, memory, (frame) => {
      if (frame === 10) boot(memory)
      if (frame === 30) memory.put(stageAt, le(ROUTINE_STAGES.parked))
    })
    expect(result).toEqual({ marks: ['takeover', 'park'], failed: undefined })
  })

  it('ends the run by the name of a stage that failed', () => {
    const memory = ram()
    const result = play(steps, memory, (frame) => {
      if (frame === 10) boot(memory)
      if (frame === 30) memory.put(stageAt, le(ROUTINE_STAGES.noSetup))
    })
    expect(result.marks).toEqual(['takeover'])
    expect(result.failed).toMatch(/"noSetup"/)
  })

  it('fails at park when the routine region no longer holds what the page wrote', () => {
    const memory = ram()
    const result = play(steps, memory, (frame) => {
      if (frame === 10) boot(memory)
      if (frame === 30) {
        memory.put(CODE + 4, [0xee])
        memory.put(stageAt, le(ROUTINE_STAGES.parked))
      }
    })
    expect(result.marks).toEqual(['takeover'])
    expect(result.failed).toMatch(/"park-region"/)
  })
})
