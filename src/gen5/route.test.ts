import { describe, expect, it } from 'vitest'

import type { RoutePlaces } from './bw2-numbers'
import { type MacroStep, routeSlice } from './macro'
import { newGameRoute, PLAYER_X, PLAYER_Z } from './route'

/** Invented places of the map's events, far from any real town's. */
const PLACES: RoutePlaces = {
  hughTrigger: { x: 10, z: 100, width: 5 },
  battleTrigger: { x: 10, z: 102, width: 5 },
  outlookTrigger: { x: 10, z: 105, width: 5 },
  bianca: { x: 12, z: 90 },
}

const marks = () =>
  newGameRoute(PLACES, []).flatMap((step) => (step.kind === 'mark' ? [step.name] : []))

// Scene: a run starts from the state saved at a mark, so each mark names one place in the route.
describe('newGameRoute', () => {
  it('names each mark once, the title first', () => {
    const names = marks()
    expect(new Set(names).size).toBe(names.length)
    expect(names[0]).toBe('title')
  })

  it('ends with the battle check and the mark "battle"', () => {
    const checks = [{ name: 'mode', address: 0x02100000, width: 4 as const, oneOf: [0] }]
    const [until, last] = newGameRoute(PLACES, checks).slice(-2)
    expect(until).toMatchObject({ kind: 'until', name: 'battle', checks, holdFor: 60 })
    expect(last).toEqual({ kind: 'mark', name: 'battle' })
  })

  it('presses Start once on the way to the title, after the opening', () => {
    const toTitle = routeSlice(newGameRoute(PLACES, []), undefined, 'title')
    const presses = toTitle.filter((step) => step.kind === 'press')
    expect(presses).toEqual([{ kind: 'press', buttons: ['Start'], frames: 4 }])
  })
})

/** The checks of every `until` step named `name`, in route order. */
function checksOf(steps: readonly MacroStep[], name: string) {
  return steps.flatMap((step) => (step.kind === 'until' && step.name === name ? step.checks : []))
}

// Scene: the route walks to the places it is given, so the map's events decide where it stops.
describe('newGameRoute on given places', () => {
  const steps = newGameRoute(PLACES, [])

  it("waits for the triggers' rows on the way to the battle", () => {
    expect(checksOf(steps, 'hugh-trigger')).toEqual([{ ...PLAYER_Z, oneOf: [100] }])
    expect(checksOf(steps, 'battle-trigger')).toEqual([{ ...PLAYER_Z, oneOf: [102] }])
  })

  it("walks the landing to the triggers' last column and up to the outlook trigger's row", () => {
    expect(checksOf(steps, 'landing')).toEqual([{ ...PLAYER_X, atMost: 14 }])
    expect(checksOf(steps, 'lookout-stairs')).toEqual([{ ...PLAYER_Z, atMost: 105 }])
  })

  it("stops in Bianca's column on the row below her", () => {
    expect(checksOf(steps, 'below-bianca')).toEqual([
      { ...PLAYER_X, atMost: 12 },
      { ...PLAYER_Z, atMost: 91 },
    ])
  })
})
