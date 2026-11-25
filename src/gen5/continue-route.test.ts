import { describe, expect, it } from 'vitest'

import type { RoutePlaces } from './bw2-numbers'
import { continueRoute, MENU_LIMIT } from './continue-route'
import { type MacroStep, routeSlice } from './macro'
import type { RamCheck } from './ram-check'
import { newGameRoute } from './route'
import { FIELD_X } from './trainer-route'

/** Invented places of the map's events, far from any real town's. */
const PLACES: RoutePlaces = {
  hughTrigger: { x: 10, z: 100, width: 5 },
  battleTrigger: { x: 10, z: 102, width: 5 },
  outlookTrigger: { x: 10, z: 105, width: 5 },
  bianca: { x: 12, z: 90 },
}

/** Invented battle checks: one value and one pointer, far from any real address. */
const CHECKS: RamCheck[] = [
  { name: 'mode', address: 0x02100000, width: 4, oneOf: [0] },
  { name: 'pointer', address: 0x02100004, width: 4, mainRamPointer: true },
]

const pressed = (steps: readonly MacroStep[]) =>
  steps.flatMap((step) => (step.kind === 'press' ? step.buttons : []))

const untils = (steps: readonly MacroStep[]) =>
  steps.flatMap((step) => (step.kind === 'until' ? [step] : []))

/** The most frames `steps` can take before the last `until` step's checks first hold: every fixed
 * step's frames, every earlier `until` step's limit, and the last one's limit less the frames its
 * checks must go on holding after the first. */
function worstFrames(steps: readonly MacroStep[]): number {
  const last = untils(steps).at(-1)
  const all = steps.reduce((sum, step) => {
    if (step.kind === 'until') return sum + step.limit
    return sum + ('frames' in step ? step.frames : 0)
  }, 0)
  return all - (last === undefined ? 0 : last.holdFor - 1)
}

// Scene: the page boots with the save before Youngster Terrell. The macro takes the title, the
// start menu's CONTINUE, the wipe into Route 20 and the walk east into his sight; his line and the
// battle's opening follow with A, which stops once the battle checks first hold, and the run ends
// once the action menu stands.
describe('continueRoute', () => {
  const steps = continueRoute(CHECKS)

  it("starts with the new game's opening up to the title", () => {
    const opening = routeSlice(newGameRoute(PLACES, []), undefined, 'title')
    expect(routeSlice(steps, undefined, 'title')).toEqual(opening)
  })

  it('marks the start menu, the field, the battle start, the action menu and the battle', () => {
    const names = routeSlice(steps, 'title', undefined).flatMap((step) =>
      step.kind === 'mark' ? [step.name] : [],
    )
    expect(names).toEqual(['continue', 'field', 'battle-start', 'action', 'battle'])
  })

  it('presses A once on the title and once on CONTINUE', () => {
    expect(pressed(routeSlice(steps, 'title', 'continue'))).toEqual(['A'])
    expect(pressed(routeSlice(steps, 'continue', 'field'))).toEqual(['A'])
  })

  it("holds Right and presses A from CONTINUE until the player stands in the trainer's sight", () => {
    const [walk] = untils(routeSlice(steps, 'continue', 'field'))
    expect(walk?.mash).toMatchObject({ buttons: ['A'], held: ['Right'] })
    expect(walk?.checks.map(({ name, address }) => ({ name, address }))).toEqual([
      { name: FIELD_X.name, address: FIELD_X.address },
    ])
  })

  it('presses only A, and Right in the field step, until the battle checks first hold', () => {
    const before = routeSlice(steps, 'title', 'action')
    expect(before.some((step) => step.kind === 'mash')).toBe(false)
    expect(new Set(pressed(before))).toEqual(new Set(['A']))
    const mashes = untils(before).map((step) => step.mash)
    expect(mashes.map((mash) => mash?.buttons)).toEqual([['A'], ['A'], ['A']])
    expect(mashes.map((mash) => mash?.held)).toEqual([['Right'], undefined, undefined])
  })

  it('presses A through the opening until every battle check holds once', () => {
    const [start, action] = untils(routeSlice(steps, 'field', 'action'))
    expect(start?.checks).toEqual(CHECKS.filter((check) => check.mainRamPointer === true))
    expect(action).toMatchObject({ name: 'action', checks: CHECKS, holdFor: 1 })
  })

  it('presses nothing from the first frame the checks hold, while they hold for 60 frames', () => {
    const after = routeSlice(steps, 'action', undefined)
    expect(after.filter((step) => step.kind === 'press' || step.kind === 'mash')).toEqual([])
    const [battle, ...rest] = untils(after)
    expect(rest).toEqual([])
    expect(battle).toMatchObject({ name: 'battle', checks: CHECKS, holdFor: 60 })
    expect(battle?.mash).toBeUndefined()
  })

  it('gives every wait from the title a limit, so a slow step fails the run', () => {
    const waits = untils(routeSlice(steps, 'title', 'battle'))
    expect(waits.map((step) => step.name)).toEqual(['field', 'battle-start', 'action', 'battle'])
    expect(worstFrames(routeSlice(steps, 'title', 'battle'))).toBeLessThan(2 * MENU_LIMIT)
  })

  // #78 asks for 1,800 frames at most from the title to the action menu, counted to the first
  // frame the battle checks hold (the mark "action"). Every wait's limit counts in full here.
  it('reaches the action menu within the limit from the title', () => {
    expect(MENU_LIMIT).toBe(1800)
    expect(worstFrames(routeSlice(steps, 'title', 'action'))).toBeLessThanOrEqual(MENU_LIMIT)
  })
})
