import { describe, expect, it } from 'vitest'

import { directEntry } from './direct-entry'
import { ENTRY, ROUTINE } from './direct-entry.fixtures'
import { takeover } from './direct-takeover'
import type { MacroStep } from './macro'
import type { RamCheck } from './ram-check'

// Every address, offset, size and constant here is invented (direct-entry.fixtures.ts).

const BATTLE: RamCheck[] = [
  { name: 'adapter', address: 0x02150000, width: 4, mainRamPointer: true },
]
const NAMES = { player: 'Ann', opponent: 'Bo' }

const { steps, notes, watch } = directEntry(ENTRY, ROUTINE, NAMES, BATTLE)
const names = steps.map((step) => ('name' in step ? `${step.kind} ${step.name}` : step.kind))
const at = (name: string) => names.indexOf(name)
const untilOf = (name: string) => {
  const step = steps.find((one) => one.kind === 'until' && one.name === name)
  return step?.kind === 'until' ? step : undefined
}

/** True for a step that never takes a frame once it holds: a mark, or an until of limit 0. */
const frameless = (step: MacroStep) =>
  step.kind === 'mark' || (step.kind === 'until' && step.limit === 0)

// Scene: two runs of the direct entry differed after the park, since the script queued the park's
// plan at wall time. As one plan, the park's writes follow the parked stage in the same frame.
describe('directEntry', () => {
  it('plays one plan from power-on to the action menu: the takeover, the park, the battle', () => {
    expect(names).toEqual([
      'until takeover-window',
      'write takeover',
      'until takeover-region',
      'mark takeover',
      'until routine-stage',
      'until noGameData',
      'until noSetup',
      'until park-region',
      'mark park',
      'until park-check',
      'write park',
      'until go-region',
      'write go',
      'until gone',
      'mark gone',
      'until battle-start',
      'mark battle-start',
      'until action',
      'mark action',
      'until battle',
      'mark battle',
    ])
    expect(notes).toEqual([])
  })

  it('writes the park in the frame the routine reads parked: no step between takes a frame', () => {
    const between = steps.slice(at('until routine-stage') + 1, at('write park'))
    expect(between.length).toBeGreaterThan(0)
    expect(between.every(frameless)).toBe(true)
  })

  it("checks the routine's region at the takeover, at the park and before the go alike", () => {
    const { region } = takeover(ENTRY, ROUTINE)
    expect(untilOf('takeover-region')?.checks).toEqual(region)
    expect(untilOf('park-region')?.checks).toEqual(region)
    expect(untilOf('go-region')?.checks).toEqual(region)
    expect(at('write go')).toBe(at('until go-region') + 1)
  })

  it('writes the go after every other write, and nothing after it', () => {
    const writes = names.filter((name) => name.startsWith('write '))
    expect(writes).toEqual(['write takeover', 'write park', 'write go'])
  })

  it('watches the queue, the stage once, the setup and both party pointers', () => {
    expect(watch.map((ref) => ref.name)).toEqual([
      'manager.queued',
      'manager.nextFunctions',
      'stage',
      'setup',
      'player.party',
      'opponent.party',
    ])
  })

  it('gives the cuts of the names for the log', () => {
    const long = directEntry(ENTRY, ROUTINE, { player: 'Ann', opponent: 'Bartholomew' }, BATTLE)
    expect(long.notes).toEqual([
      'opponent.name: "Bartholomew" cut to "Bartholo", the 8 characters it holds',
    ])
  })
})
