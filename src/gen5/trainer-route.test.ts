import { describe, expect, it } from 'vitest'

import type { MacroStep } from './macro'
import { PLAYER_Z } from './route'
import { fastText, OPTIONS_SLOT_WITH_POKEDEX, SAVE_SLOT_WITH_POKEDEX, saveGame } from './save-menu'
import { FIELD_X, trainerRoute } from './trainer-route'
import { PLACES, TRAINER } from './route.fixtures'

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

/** A mark a beat hands out (`<scene>-NN`), as against the mark that ends a scene. */
const isBeat = (name: string) => /-\d+$/.test(name)

const pressedA = (step: MacroStep) =>
  (step.kind === 'press' && step.buttons.includes('A')) ||
  ((step.kind === 'mash' || step.kind === 'until') && step.mash?.buttons.includes('A') === true)

// Scene: IRV stands in the rival battle's action menu (the spike's state s5-battle), and the
// macro plays the story on from there to a save on Route 20, a few tiles west of Youngster
// Terrell's sight line, with the text speed set to fast.
describe('trainerRoute', () => {
  const { steps, stateMarks } = trainerRoute(PLACES, TRAINER)

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
    scenes.push(
      'bianca-call',
      'capture-over',
      'alder-gone',
      'house-08',
      'errand-12',
      'before-terrell',
    )
    scenes.push('text-fast', 'saved')
    const names = markNames(steps)
    expect(scenes.map((scene) => names.indexOf(scene))).toEqual(
      [...scenes.map((scene) => names.indexOf(scene))].sort((a, b) => a - b),
    )
    expect(scenes.filter((scene) => !names.includes(scene))).toEqual([])
  })

  it("walks east to the save's place by the field's position, Right held", () => {
    const walk =
      steps[steps.findIndex((step) => step.kind === 'mark' && step.name === 'before-terrell') - 1]
    expect(walk).toMatchObject({ kind: 'until', mash: { buttons: ['Right'] } })
    expect(walk?.kind === 'until' && walk.checks[0]?.address).toBe(FIELD_X.address)
  })

  it("stops the walk two tiles west of the trainer's column, before his sight line", () => {
    const walk =
      steps[steps.findIndex((step) => step.kind === 'mark' && step.name === 'before-terrell') - 1]
    expect(walk?.kind === 'until' && walk.checks).toEqual([{ ...FIELD_X, oneOf: [TRAINER.x - 2] }])
  })

  it('ends with the text speed set in Options and the save in the menu with the Pokédex', () => {
    const menu = [...fastText(OPTIONS_SLOT_WITH_POKEDEX), ...saveGame(SAVE_SLOT_WITH_POKEDEX)]
    expect(steps.slice(-menu.length)).toEqual(menu)
  })

  it('presses no A between the battle and the menu: B closes the text and starts no talk', () => {
    const menu =
      fastText(OPTIONS_SLOT_WITH_POKEDEX).length + saveGame(SAVE_SLOT_WITH_POKEDEX).length
    expect(steps.slice(1, -menu).filter(pressedA)).toEqual([])
  })

  it('keeps a state at the marks that end a scene, and none at the beats or the waits', () => {
    expect(stateMarks).toEqual(markNames(steps).filter((name) => !isBeat(name)))
    expect(stateMarks).toEqual(expect.arrayContaining(['center-door', 'before-terrell', 'saved']))
  })

  it('plays on after the mark of the state it starts from, and keeps the states after it', () => {
    const from = trainerRoute(PLACES, TRAINER, 'city-free')
    expect(markNames(from.steps)[0]).toBe('gate-column')
    expect(from.stateMarks).toEqual(markNames(from.steps).filter((name) => !isBeat(name)))
    expect(trainerRoute(PLACES, TRAINER, 'battle').steps).toEqual(steps)
  })
})
