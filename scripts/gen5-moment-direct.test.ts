import { describe, expect, it } from 'vitest'

import type { ActorPlace } from '../src/gen5/bw2-numbers'
import { ENTRY, ROUTINE } from '../src/gen5/direct-entry.fixtures'
import type { MacroStep } from '../src/gen5/macro'
import type { RamCheck, RamRef } from '../src/gen5/ram-check'
import { firstRun, readMomentOptions } from './gen5-moment-args'
import { sessionPlan } from './gen5-moment-direct'

// Every address, offset, size and constant here is invented (src/gen5/direct-entry.fixtures.ts).

const NOW = 1_000_000
const CHECKS: RamCheck[] = [
  { name: 'adapter', address: 0x02150000, width: 4, mainRamPointer: true },
  { name: 'mode', address: 0x02150004, width: 4, oneOf: [2] },
]
const WATCH: RamRef[] = [{ name: 'mode', address: 0x02150004, width: 4 }]
const REFS = { checks: CHECKS, watch: WATCH }
const TRAINER: ActorPlace = { x: 30, z: 300 }

const noState = () => {
  throw new Error('a run from boot reads no state')
}
const noRoutine = () => {
  throw new Error('the walk reads no routine')
}
const noParties = () => {
  throw new Error('the walk reads no parties')
}
/** An invented sealed Pokémon of the fixture's PartyPkm size, for each side. */
const PKM = new Uint8Array(0x60).fill(5)
const saves: string[] = []
const readParties = (save: string) => {
  saves.push(save)
  return { player: [PKM], opponent: [PKM] }
}
const input = { refs: REFS, trainer: TRAINER, entry: ENTRY, readState: noState, readParties }
const lastMark = (steps: readonly MacroStep[]) =>
  steps.flatMap((step) => (step.kind === 'mark' ? [step.name] : [])).at(-1)

// Scene: the moment script plays the session's one plan until the battle's action menu.
describe('sessionPlan', () => {
  it('plays the walk as one plan, the continue route, and reads no routine', () => {
    const options = readMomentOptions(['--save', 'route-20'], NOW)
    const { plan, notes } = sessionPlan(options, {
      ...input,
      readRoutine: noRoutine,
      readParties: noParties,
    })
    expect(plan).toEqual(firstRun(options.start, REFS, TRAINER, noState))
    expect(notes).toEqual([])
  })

  it('plays the direct entry as one plan, from power-on through the park to the action menu', () => {
    const options = readMomentOptions(['--entry', 'direct', '--save', 'route-20'], NOW)
    const { plan } = sessionPlan(options, { ...input, readRoutine: () => ROUTINE })
    expect(plan.steps[0]).toMatchObject({ kind: 'until', name: 'takeover-window' })
    expect(lastMark(plan.steps)).toBe('battle')
    expect(plan.state).toBeUndefined()
    expect(plan.stateMarks).toEqual([])
    expect(saves.at(-1)).toBe('route-20')
    const park = plan.steps.find((step) => step.kind === 'write' && step.name === 'park')
    const fields = park?.kind === 'write' ? park.writes.map((write) => write.field) : []
    expect(fields).toContain('player.party.pkms[0]')
    expect(fields).toContain('opponent.party.pkms[0]')
    expect(fields).toContain('battleStyle')
    expect(plan.watch.map((ref) => ref.name)).toEqual([
      'manager.queued',
      'manager.nextFunctions',
      'stage',
      'setup',
      'player.party',
      'opponent.party',
      'mode',
    ])
  })

  it('refuses the direct entry from a state, which holds no save to read the parties from', () => {
    const options = readMomentOptions(['--entry', 'direct', '--save', 'route-20'], NOW)
    const fromState = { ...options, start: { from: 'state' as const, state: 's5-battle' } }
    expect(() => sessionPlan(fromState, { ...input, readRoutine: () => ROUTINE })).toThrow(
      'the direct entry starts from boot with a save',
    )
  })

  it('gives the cut of a name for the log', () => {
    const names = ['--player', 'Ann', '--opponent', 'Bartholomew']
    const args = ['--entry', 'direct', '--save', 'route-20', ...names]
    const { notes } = sessionPlan(readMomentOptions(args, NOW), {
      ...input,
      readRoutine: () => ROUTINE,
    })
    expect(notes).toEqual([
      'opponent.name: "Bartholomew" cut to "Bartholo", the 8 characters it holds',
    ])
  })
})
