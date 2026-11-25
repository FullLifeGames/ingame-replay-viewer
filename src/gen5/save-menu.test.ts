import { describe, expect, it } from 'vitest'

import type { MacroStep } from './macro'
import { SAVE_SLOT_BEFORE_POKEMON, saveGame, WRITE_FRAMES } from './save-menu'

const pressed = (steps: readonly MacroStep[]) =>
  steps.flatMap((step) => (step.kind === 'press' ? step.buttons : []))

const framesOf = (steps: readonly MacroStep[]) =>
  steps.reduce((sum, step) => sum + ('frames' in step ? step.frames : 0), 0)

const markNames = (steps: readonly MacroStep[]) =>
  steps.flatMap((step) => (step.kind === 'mark' ? [step.name] : []))

/** The index of the `n`-th press of `button` (from 1). */
function nthPress(steps: readonly MacroStep[], button: string, n: number): number {
  let seen = 0
  const at = steps.findIndex(
    (step) => step.kind === 'press' && step.buttons.includes(button as 'A') && ++seen === n,
  )
  if (at < 0) throw new Error(`no press ${String(n)} of ${button}`)
  return at
}

// Scene: IRV stands in the field and the macro saves the game through the menu on the touch
// screen, whose Save button sits in another place for each kind of menu.
describe('saveGame', () => {
  const slot = { row: 2, column: 1 }
  const steps = saveGame(slot)

  it('opens the menu with X before any other press', () => {
    expect(pressed(steps)[0]).toBe('X')
  })

  it("moves the cursor to the slot's row and column before the first A", () => {
    const toSave = pressed(steps.slice(0, nthPress(steps, 'A', 1)))
    expect(toSave.filter((button) => button === 'Down')).toHaveLength(2)
    expect(toSave.filter((button) => button === 'Right')).toHaveLength(1)
    expect(toSave.filter((button) => button === 'Left')).toHaveLength(0)
  })

  it('takes another slot for another menu', () => {
    const other = saveGame({ row: 0, column: 0 })
    const toSave = pressed(other.slice(0, nthPress(other, 'A', 1)))
    expect(toSave.filter((button) => button === 'Down' || button === 'Right')).toEqual([])
  })

  it('answers YES with A, and presses no B before it, since B answers NO', () => {
    const yes = nthPress(steps, 'A', 2)
    expect(pressed(steps.slice(0, yes))).not.toContain('B')
  })

  it('gives the write its frames after YES and ends with the mark "saved"', () => {
    const afterYes = steps.slice(nthPress(steps, 'A', 2) + 1)
    expect(framesOf(afterYes)).toBeGreaterThanOrEqual(WRITE_FRAMES)
    expect(steps.at(-1)).toEqual({ kind: 'mark', name: 'saved' })
  })

  it('names each mark once and leaves no more than 30 frames between two marks', () => {
    const names = markNames(steps)
    expect(new Set(names).size).toBe(names.length)
    let since = 0
    for (const step of steps) {
      since = step.kind === 'mark' ? 0 : since + ('frames' in step ? step.frames : 0)
      expect(since).toBeLessThanOrEqual(30)
    }
  })

  it("places the Save button of the menu before the first Pokémon in the menu's grid", () => {
    const { row, column } = SAVE_SLOT_BEFORE_POKEMON
    expect([0, 1, 2]).toContain(row)
    expect([0, 1]).toContain(column)
  })
})
