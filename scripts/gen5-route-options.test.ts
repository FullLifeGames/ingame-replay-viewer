import { describe, expect, it } from 'vitest'

import { readRouteOptions, stateBase } from './gen5-route-options'

const NOW = 1_000_000

// Scene: the run script's command line, as the lane's heavy runs give it.
describe('readRouteOptions', () => {
  it('plays the new game from boot by default, under the label s5 for 18 minutes', () => {
    expect(readRouteOptions([], NOW)).toEqual({
      route: 'new-game',
      from: undefined,
      to: undefined,
      state: undefined,
      save: undefined,
      takeSave: undefined,
      query: '',
      label: 's5',
      uncapped: false,
      deadlineMs: NOW + 18 * 60_000,
    })
  })

  it('reads the town save: the save route from a named state, taking the save afterwards', () => {
    const args = ['--route', 'save-here', '--state', 's5-boot1-north-east-04']
    const options = readRouteOptions([...args, '--take-save', 'town', '--label', 's78'], NOW)
    expect(options).toMatchObject({
      route: 'save-here',
      state: 's5-boot1-north-east-04',
      takeSave: 'town',
      label: 's78',
    })
  })

  it('reads the continue route with a queued save and an address query', () => {
    const args = ['--route', 'continue', '--save', 'build/gen5/saves/town.sav']
    const options = readRouteOptions([...args, '--query', '?save=route-20', '--minutes', '5'], NOW)
    expect(options).toMatchObject({
      route: 'continue',
      save: 'build/gen5/saves/town.sav',
      query: '?save=route-20',
      deadlineMs: NOW + 5 * 60_000,
    })
    expect(readRouteOptions(['--query', 'save=x'], NOW).query).toBe('?save=x')
  })

  it('refuses a route it does not know', () => {
    expect(() => readRouteOptions(['--route', 'trainer'], NOW)).toThrow(
      '--route takes new-game, save-here or continue, not "trainer".',
    )
  })

  it('refuses the save route without a state to start from', () => {
    expect(() => readRouteOptions(['--route', 'save-here'], NOW)).toThrow(
      'The save route needs --state: it saves where a state stands.',
    )
  })

  it("keeps --from and --to to the new game's marks", () => {
    expect(() => readRouteOptions(['--route', 'continue', '--to', 'field'], NOW)).toThrow(
      '--from and --to cut the new-game route only.',
    )
    expect(() => readRouteOptions(['--from', 'title', '--state', 'x'], NOW)).toThrow(
      '--from names a state already; give --from or --state, not both.',
    )
  })

  it('refuses a save name the servers would not answer', () => {
    expect(() => readRouteOptions(['--take-save', '../town'], NOW)).toThrow(
      '--take-save takes lower-case letters, digits and inner hyphens, not "../town".',
    )
  })

  it('refuses minutes that are not a positive number', () => {
    expect(() => readRouteOptions(['--minutes', 'soon'], NOW)).toThrow(
      '--minutes takes a positive number, not "soon".',
    )
  })
})

describe('stateBase', () => {
  it("names a new game's mark state by the s5 label, and any other state as given", () => {
    expect(stateBase(readRouteOptions(['--from', 'battle'], NOW))).toBe('s5-battle')
    const args = ['--route', 'save-here', '--state', 's5-boot1-north-east-04']
    expect(stateBase(readRouteOptions(args, NOW))).toBe('s5-boot1-north-east-04')
    expect(stateBase(readRouteOptions([], NOW))).toBeUndefined()
  })
})
