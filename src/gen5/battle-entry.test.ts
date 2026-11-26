import { describe, expect, it } from 'vitest'

import { battleEntry, TO_TITLE } from './battle-entry'
import type { RamCheck } from './ram-check'

/** Invented checks: one value and one pointer, far from any real address. */
const MODE: RamCheck = { name: 'mode', address: 0x02100000, width: 4, oneOf: [0] }
const POINTER: RamCheck = { name: 'pointer', address: 0x02100004, width: 4, mainRamPointer: true }

// Scene: every route from boot skips the opening the same way and reaches the title.
describe('TO_TITLE', () => {
  it('presses Start once and ends on the mark "title"', () => {
    expect(TO_TITLE.filter((step) => step.kind === 'press')).toEqual([
      { kind: 'press', buttons: ['Start'], frames: 4 },
    ])
    expect(TO_TITLE.at(-1)).toEqual({ kind: 'mark', name: 'title' })
  })
})

// Scene: a route meets a battle. A closes the text until the battle has its adapter, then the
// route presses nothing until the action menu stands, because an A there would pick FIGHT.
describe('battleEntry', () => {
  const steps = battleEntry([MODE, POINTER], { start: 900, battle: 300 })

  it('presses A until the adapter pointer leads into main RAM, then marks battle-start', () => {
    expect(steps.slice(0, 2)).toEqual([
      {
        kind: 'until',
        name: 'battle-start',
        checks: [POINTER],
        holdFor: 1,
        limit: 900,
        mash: { buttons: ['A'], every: 20, hold: 4 },
      },
      { kind: 'mark', name: 'battle-start' },
    ])
  })

  it('presses nothing until every check holds for 60 frames, then marks battle', () => {
    expect(steps.slice(2)).toEqual([
      { kind: 'until', name: 'battle', checks: [MODE, POINTER], holdFor: 60, limit: 300 },
      { kind: 'mark', name: 'battle' },
    ])
  })

  it('marks the wait for the adapter and presses A on a quicker beat, if asked to', () => {
    const [start] = battleEntry(
      [MODE, POINTER],
      { start: 900, battle: 300 },
      {
        markEvery: 30,
        every: 4,
      },
    )
    expect(start).toMatchObject({
      name: 'battle-start',
      markEvery: 30,
      mash: { buttons: ['A'], every: 4, hold: 2 },
    })
    expect(steps[0]).not.toHaveProperty('markEvery')
  })
})

// Scene: the short route may press A through the battle's opening as well, so its messages pass
// sooner. A stops on the first frame every check holds, before the action menu can take a press.
describe('battleEntry through the opening', () => {
  const limits = { start: 900, battle: 300 }
  const steps = battleEntry([MODE, POINTER], limits, { every: 4, throughOpening: true })
  const mash = { buttons: ['A'], every: 4, hold: 2 }

  it('presses A until the adapter, then marks battle-start as without the option', () => {
    expect(steps.slice(0, 2)).toEqual([
      { kind: 'until', name: 'battle-start', checks: [POINTER], holdFor: 1, limit: 900, mash },
      { kind: 'mark', name: 'battle-start' },
    ])
  })

  it('presses A on the same beat until every check holds once, then marks action', () => {
    expect(steps.slice(2, 4)).toEqual([
      { kind: 'until', name: 'action', checks: [MODE, POINTER], holdFor: 1, limit: 300, mash },
      { kind: 'mark', name: 'action' },
    ])
  })

  it('presses nothing while every check holds for 60 frames, then marks battle', () => {
    const [hold, end, ...rest] = steps.slice(4)
    expect(hold).toMatchObject({ kind: 'until', name: 'battle', checks: [MODE, POINTER] })
    expect(hold).toMatchObject({ holdFor: 60 })
    expect(hold).not.toHaveProperty('mash')
    expect(hold?.kind === 'until' && hold.limit).toBeGreaterThanOrEqual(60)
    expect(hold?.kind === 'until' && hold.limit).toBeLessThanOrEqual(70)
    expect(end).toEqual({ kind: 'mark', name: 'battle' })
    expect(rest).toEqual([])
  })

  it('marks the opening every so many frames, if asked to, so its text shows in the frames', () => {
    const pace = { every: 4, throughOpening: true, openingMarkEvery: 30 }
    expect(battleEntry([MODE, POINTER], limits, pace)[2]).toEqual({
      kind: 'until',
      name: 'action',
      checks: [MODE, POINTER],
      holdFor: 1,
      limit: 300,
      mash,
      markEvery: 30,
    })
  })

  it('keeps the steps of today without the option', () => {
    expect(battleEntry([MODE, POINTER], limits, { every: 4, throughOpening: false })).toEqual(
      battleEntry([MODE, POINTER], limits, { every: 4 }),
    )
  })
})
