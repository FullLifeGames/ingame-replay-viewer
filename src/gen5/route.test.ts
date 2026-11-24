import { describe, expect, it } from 'vitest'

import { routeSlice } from './macro'
import { newGameRoute } from './route'

const marks = () => newGameRoute([]).flatMap((step) => (step.kind === 'mark' ? [step.name] : []))

// Scene: a run starts from the state saved at a mark, so each mark names one place in the route.
describe('newGameRoute', () => {
  it('names each mark once, the title first', () => {
    const names = marks()
    expect(new Set(names).size).toBe(names.length)
    expect(names[0]).toBe('title')
  })

  it('ends with the battle check and the mark "battle"', () => {
    const checks = [{ name: 'mode', address: 0x02100000, width: 4 as const, oneOf: [0] }]
    const [until, last] = newGameRoute(checks).slice(-2)
    expect(until).toMatchObject({ kind: 'until', name: 'battle', checks, holdFor: 60 })
    expect(last).toEqual({ kind: 'mark', name: 'battle' })
  })

  it('presses Start once on the way to the title, after the opening', () => {
    const toTitle = routeSlice(newGameRoute([]), undefined, 'title')
    const presses = toTitle.filter((step) => step.kind === 'press')
    expect(presses).toEqual([{ kind: 'press', buttons: ['Start'], frames: 4 }])
  })
})
