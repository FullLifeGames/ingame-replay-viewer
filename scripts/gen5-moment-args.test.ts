import { describe, expect, it } from 'vitest'

import { continueRoute } from '../src/gen5/continue-route'
import type { RamCheck, RamRef } from '../src/gen5/ram-check'
import { firstRun, readMomentOptions, type StateFile } from './gen5-moment-args'

const NOW = 1_000_000

/** Invented battle checks and watch, far from any real address. */
const CHECKS: RamCheck[] = [
  { name: 'mode', address: 0x02100000, width: 4, oneOf: [0] },
  { name: 'pointer', address: 0x02100004, width: 4, mainRamPointer: true },
]
const WATCH: RamRef[] = [{ name: 'mode', address: 0x02100000, width: 4 }]
const REFS = { checks: CHECKS, watch: WATCH }

/** An invented state file: its base64, frame and main RAM hash. */
const STATE: StateFile = { state: 'c3RhdGU=', frame: 1234, ramSha: 'ab'.repeat(32) }

// Scene: the moment run's command line, as the spike gave it and as #78's run from the save does.
describe('readMomentOptions', () => {
  it('runs the known scene from the spike state s5-battle by default, for 15 minutes', () => {
    expect(readMomentOptions([], NOW)).toEqual({
      scene: 'known',
      start: { from: 'state', state: 's5-battle' },
      label: 's6-known',
      deadlineMs: NOW + 15 * 60_000,
    })
  })

  it('plays one session from boot with --save: the page address names the save', () => {
    const args = ['--scene', 'known', '--save', 'route-20']
    expect(readMomentOptions(args, NOW)).toEqual({
      scene: 'known',
      start: { from: 'boot', save: 'route-20', query: '?save=route-20' },
      label: 'route-20-known',
      deadlineMs: NOW + 15 * 60_000,
    })
  })

  it('reads the unknown scene and the minutes', () => {
    const options = readMomentOptions(['--scene', 'unknown', '--minutes', '20'], NOW)
    expect(options).toMatchObject({ scene: 'unknown', label: 's6-unknown' })
    expect(options.deadlineMs).toBe(NOW + 20 * 60_000)
  })

  it('refuses a scene it does not know, a bad save name and minutes that are not positive', () => {
    expect(() => readMomentOptions(['--scene', 'other'], NOW)).toThrow(
      '--scene takes known or unknown, not "other".',
    )
    expect(() => readMomentOptions(['--save', '../route-20'], NOW)).toThrow(
      '--save takes lower-case letters, digits and inner hyphens, not "../route-20".',
    )
    expect(() => readMomentOptions(['--minutes', '0'], NOW)).toThrow(
      '--minutes takes a positive number, not "0".',
    )
  })

  it('refuses an option it does not know', () => {
    expect(() => readMomentOptions(['--state', 's78m1-battle'], NOW)).toThrow()
  })
})

describe('firstRun', () => {
  const noState = () => {
    throw new Error('a run from boot reads no state')
  }

  it('starts from boot with the continue route to the action menu, and loads no state', () => {
    const start = readMomentOptions(['--save', 'route-20'], NOW).start
    const plan = firstRun(start, REFS, noState)
    expect(plan.steps).toEqual(continueRoute(CHECKS))
    expect(plan.state).toBeUndefined()
    expect(plan.stateSha).toBeUndefined()
    expect(plan.startFrame).toBe(0)
    expect(plan.watch).toEqual(WATCH)
    expect(plan.stateMarks).toEqual([])
  })

  it('ends the route at the mark battle, where the action menu stands untouched', () => {
    const start = readMomentOptions(['--save', 'route-20'], NOW).start
    const marks = firstRun(start, REFS, noState).steps.flatMap((step) =>
      step.kind === 'mark' ? [step.name] : [],
    )
    expect(marks.at(-1)).toBe('battle')
  })

  it('loads the spike state with no flag and waits two frames, as the spike did', () => {
    const read: string[] = []
    const plan = firstRun(readMomentOptions([], NOW).start, REFS, (base) => {
      read.push(base)
      return STATE
    })
    expect(read).toEqual(['s5-battle'])
    expect(plan).toEqual({
      steps: [{ kind: 'wait', frames: 2 }],
      state: STATE.state,
      stateSha: STATE.ramSha,
      startFrame: STATE.frame,
      watch: WATCH,
      stateMarks: [],
    })
  })
})
