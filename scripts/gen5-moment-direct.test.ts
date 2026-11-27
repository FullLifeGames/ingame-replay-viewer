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
/** Invented sealed Pokémon of the fixture's PartyPkm size: two for the player, one opponent. */
const PKM = new Uint8Array(0x60).fill(5)
const parties = { player: [PKM, PKM], opponent: [PKM] }
const team = { parties, names: { player: 'Viewer', opponent: 'Showdown' } }
const input = { refs: REFS, trainer: TRAINER, entry: ENTRY, readState: noState, team }
const lastMark = (steps: readonly MacroStep[]) =>
  steps.flatMap((step) => (step.kind === 'mark' ? [step.name] : [])).at(-1)

// Scene: the moment script plays the session's one plan until the battle's action menu.
describe('sessionPlan', () => {
  it('plays the walk as one plan, the continue route, and reads no routine', () => {
    const options = readMomentOptions(['--entry', 'walk', '--save', 'route-20'], NOW)
    const { plan, notes } = sessionPlan(options, {
      ...input,
      readRoutine: noRoutine,
      team: undefined,
    })
    expect(plan).toEqual(firstRun(options.start, REFS, TRAINER, noState))
    expect(notes).toEqual([])
  })

  it('plays the direct entry as one plan, from power-on through the park to the action menu', () => {
    const options = readMomentOptions(['--entry', 'direct'], NOW)
    const { plan } = sessionPlan(options, { ...input, readRoutine: () => ROUTINE })
    expect(plan.steps[0]).toMatchObject({ kind: 'until', name: 'takeover-window' })
    expect(lastMark(plan.steps)).toBe('battle')
    expect(plan.state).toBeUndefined()
    expect(plan.stateMarks).toEqual([])
    const park = plan.steps.find((step) => step.kind === 'write' && step.name === 'park')
    const fields = park?.kind === 'write' ? park.writes.map((write) => write.field) : []
    expect(fields.filter((field) => field.includes('.party.pkms['))).toEqual([
      'player.party.pkms[0]',
      'player.party.pkms[1]',
      'opponent.party.pkms[0]',
    ])
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

  // Scene: a double (plan E-6, decision 5) writes its style at the park and reads it back.
  it('writes the double style at the park and reads it back before the go', () => {
    const options = readMomentOptions(['--entry', 'direct', '--battle', 'double'], NOW)
    const { plan } = sessionPlan(options, { ...input, readRoutine: () => ROUTINE })
    const park = plan.steps.find((step) => step.kind === 'write' && step.name === 'park')
    const style =
      park?.kind === 'write' ? park.writes.find((w) => w.field === 'battleStyle') : undefined
    expect(style).toMatchObject({ kind: 'bytes', bytes: [6, 0, 0, 0] })
    const written = plan.steps.find((step) => step.kind === 'until' && step.name === 'park-written')
    const check =
      written?.kind === 'until' ? written.checks.find((c) => c.name === 'battleStyle') : undefined
    expect(check?.oneOf).toEqual([ENTRY.constants.BTL_STYLE_DOUBLE])
  })

  it('refuses the direct entry from a state, and with no parties to write', () => {
    const options = readMomentOptions(['--entry', 'direct'], NOW)
    const fromState = { ...options, start: { from: 'state' as const, state: 's5-battle' } }
    expect(() => sessionPlan(fromState, { ...input, readRoutine: () => ROUTINE })).toThrow(
      'the direct entry starts from boot',
    )
    const none = { ...input, readRoutine: () => ROUTINE, team: undefined }
    expect(() => sessionPlan(options, none)).toThrow('the direct entry needs both parties')
  })

  it('gives the cut of a name for the log', () => {
    const names = { player: 'Ann', opponent: 'Bartholomew' }
    const { notes } = sessionPlan(readMomentOptions(['--entry', 'direct'], NOW), {
      ...input,
      team: { parties, names },
      readRoutine: () => ROUTINE,
    })
    expect(notes).toEqual([
      'opponent.name: "Bartholomew" cut to "Bartholo", the 8 characters it holds',
    ])
  })
})
