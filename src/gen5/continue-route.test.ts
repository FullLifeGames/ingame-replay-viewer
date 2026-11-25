import { describe, expect, it } from 'vitest'

import type { RoutePlaces } from './bw2-numbers'
import { continueRoute, probeEast } from './continue-route'
import { type MacroStep, routeSlice } from './macro'
import { newGameRoute } from './route'

/** Invented places of the map's events, far from any real town's. */
const PLACES: RoutePlaces = {
  hughTrigger: { x: 10, z: 100, width: 5 },
  battleTrigger: { x: 10, z: 102, width: 5 },
  outlookTrigger: { x: 10, z: 105, width: 5 },
  bianca: { x: 12, z: 90 },
}

const pressed = (steps: readonly MacroStep[]) =>
  steps.flatMap((step) => (step.kind === 'press' ? step.buttons : []))

const framesOf = (steps: readonly MacroStep[]) =>
  steps.reduce((sum, step) => sum + ('frames' in step ? step.frames : 0), 0)

// Scene: the page boots with a save, and the macro takes the title, the start menu's CONTINUE
// and the wipe into the field where the save was made.
describe('continueRoute', () => {
  const steps = continueRoute()

  it("starts with the new game's opening up to the title", () => {
    const opening = routeSlice(newGameRoute(PLACES, []), undefined, 'title')
    expect(routeSlice(steps, undefined, 'title')).toEqual(opening)
  })

  it('marks the start menu, then the field, and nothing else after the title', () => {
    const names = routeSlice(steps, 'title', undefined).flatMap((step) =>
      step.kind === 'mark' ? [step.name] : [],
    )
    expect(names).toEqual(['continue', 'field'])
  })

  it('presses A once on the title and once on CONTINUE', () => {
    expect(pressed(routeSlice(steps, 'title', 'continue'))).toEqual(['A'])
    expect(pressed(routeSlice(steps, 'continue', 'field'))).toEqual(['A'])
  })

  it('waits through the wipe and the fade before the mark "field"', () => {
    expect(framesOf(routeSlice(steps, 'continue', 'field'))).toBeGreaterThanOrEqual(600)
  })
})

// Scene: IRV stands on Route 20 after CONTINUE, a few tiles west of a trainer's sight line, and the
// probe walks him east into it, so the frames show the trainer's "!" and the battle's start.
describe('probeEast', () => {
  const steps = probeEast(3)

  it("holds Right on every frame and presses A to close the trainer's line", () => {
    for (const step of steps.filter((each) => each.kind !== 'mark')) {
      expect(step).toMatchObject({ kind: 'mash', mash: { buttons: ['A'], held: ['Right'] } })
    }
  })

  it('marks probe-01 on, every 30 frames', () => {
    expect(steps.flatMap((step) => (step.kind === 'mark' ? [step.name] : []))).toEqual([
      'probe-01',
      'probe-02',
      'probe-03',
    ])
    expect(framesOf(steps)).toBe(90)
  })
})
