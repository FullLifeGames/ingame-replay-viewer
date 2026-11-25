import { describe, expect, it } from 'vitest'

import type { RoutePlaces } from './bw2-numbers'
import type { MacroStep } from './macro'
import { PLAYER_Z } from './route'
import { trainerRoute } from './trainer-route'

/** Invented places of the map's events, far from any real town's. */
const PLACES: RoutePlaces = {
  hughTrigger: { x: 10, z: 100, width: 5 },
  battleTrigger: { x: 10, z: 102, width: 5 },
  outlookTrigger: { x: 10, z: 105, width: 5 },
  bianca: { x: 12, z: 90 },
}

const markNames = (steps: readonly MacroStep[]) =>
  steps.flatMap((step) => (step.kind === 'mark' ? [step.name] : []))

/** The marks an `until` step hands out while it waits: `<name>-001`, `<name>-002`, … */
const waitMarks = (steps: readonly MacroStep[]) =>
  steps.flatMap((step) =>
    step.kind === 'until' && step.markEvery !== undefined
      ? Array.from(
          { length: Math.ceil(step.limit / step.markEvery) },
          (_, i) => `${step.name}-${String(i + 1).padStart(3, '0')}`,
        )
      : [],
  )

const pressedA = (step: MacroStep) =>
  (step.kind === 'press' && step.buttons.includes('A')) ||
  ((step.kind === 'mash' || step.kind === 'until') && step.mash?.buttons.includes('A') === true)

// Scene: IRV stands in the rival battle's action menu (the spike's state s5-battle), and the
// macro plays the story on from there towards a save before a trainer on Route 20. This session's
// part ends in Floccesy Town after Alder's errand; the save comes in a later one.
describe('trainerRoute', () => {
  const { steps, stateMarks } = trainerRoute(PLACES)

  it("starts with A for the battle, until the player leaves the battle's row", () => {
    expect(steps[0]).toMatchObject({
      kind: 'until',
      checks: [{ ...PLAYER_Z, noneOf: [PLACES.battleTrigger.z] }],
      mash: { buttons: ['A'] },
    })
    expect(steps[1]).toEqual({ kind: 'mark', name: 'center-door' })
  })

  it('names every mark once, the marks its waits hand out included', () => {
    const names = [...markNames(steps), ...waitMarks(steps)]
    expect(new Set(names).size).toBe(names.length)
  })

  it('passes the scenes in story order', () => {
    const scenes = ['center-door', 'center-tour', 'center-exit', 'city-free', 'gate-road']
    scenes.push('route-19', 'capture-over', 'alder-gone', 'house-08', 'errand-12')
    const names = markNames(steps)
    expect(scenes.map((scene) => names.indexOf(scene))).toEqual(
      [...scenes.map((scene) => names.indexOf(scene))].sort((a, b) => a - b),
    )
    expect(scenes.filter((scene) => !names.includes(scene))).toEqual([])
  })

  it('presses no A after the battle: B closes the text and starts no talk', () => {
    expect(steps.slice(1).filter(pressedA)).toEqual([])
  })

  it('keeps a state at every mark of its own, and none at the marks of its waits', () => {
    expect(stateMarks).toEqual(markNames(steps))
  })

  it('plays on after the mark of the state it starts from, and keeps the states after it', () => {
    const from = trainerRoute(PLACES, 'city-free')
    expect(markNames(from.steps)[0]).toBe('gate-column')
    expect(from.stateMarks).toEqual(markNames(from.steps))
    expect(trainerRoute(PLACES, 'battle').steps).toEqual(steps)
  })
})
