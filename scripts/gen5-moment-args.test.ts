import { describe, expect, it } from 'vitest'

import type { ActorPlace } from '../src/gen5/bw2-numbers'
import { continueRoute } from '../src/gen5/continue-route'
import type { RamCheck, RamRef } from '../src/gen5/ram-check'
import { firstRun, readMomentOptions, startLine, type StateFile } from './gen5-moment-args'

const NOW = 1_000_000

/** Invented battle checks and watch, far from any real address. */
const CHECKS: RamCheck[] = [
  { name: 'mode', address: 0x02100000, width: 4, oneOf: [0] },
  { name: 'pointer', address: 0x02100004, width: 4, mainRamPointer: true },
]
const WATCH: RamRef[] = [{ name: 'mode', address: 0x02100000, width: 4 }]
const REFS = { checks: CHECKS, watch: WATCH }

/** An invented tile of the save's trainer, far from any real route's. */
const TRAINER: ActorPlace = { x: 30, z: 300 }

/** An invented state file: its base64, frame and main RAM hash. */
const STATE: StateFile = { state: 'c3RhdGU=', frame: 1234, ramSha: 'ab'.repeat(32) }

// Scene: the moment run's command line, as the spike gave it and as #78's run from the save does.
describe('readMomentOptions', () => {
  // Scene: the direct start (#97) has passed its runs from boot, so it is the default (D16): with
  // no flag the page boots with no save, and the routine writes the team.
  it('starts the known scene through the routine from boot with no save by default, for 15 minutes', () => {
    expect(readMomentOptions([], NOW)).toEqual({
      scene: 'known',
      start: { from: 'boot', query: '' },
      entry: 'direct',
      battle: 'single',
      names: { player: 'Viewer', opponent: 'Showdown' },
      label: 'nosave-direct-known',
      deadlineMs: NOW + 15 * 60_000,
    })
  })

  it('runs the walk from the spike state s5-battle with --entry walk and no save', () => {
    expect(readMomentOptions(['--entry', 'walk'], NOW)).toMatchObject({
      start: { from: 'state', state: 's5-battle' },
      entry: 'walk',
      label: 's6-known',
    })
  })

  it('walks from boot with --entry walk --save: the page address names the save', () => {
    const args = ['--scene', 'known', '--entry', 'walk', '--save', 'route-20']
    expect(readMomentOptions(args, NOW)).toEqual({
      scene: 'known',
      start: { from: 'boot', save: 'route-20', query: '?save=route-20' },
      entry: 'walk',
      battle: 'single',
      names: { player: 'Viewer', opponent: 'Showdown' },
      label: 'route-20-known',
      deadlineMs: NOW + 15 * 60_000,
    })
  })

  it('reads the unknown scene and the minutes', () => {
    const options = readMomentOptions(['--scene', 'unknown', '--minutes', '20'], NOW)
    expect(options).toMatchObject({ scene: 'unknown', label: 'nosave-direct-unknown' })
    expect(options.deadlineMs).toBe(NOW + 20 * 60_000)
  })

  it('refuses a scene it does not know, a bad save name and minutes that are not positive', () => {
    expect(() => readMomentOptions(['--scene', 'other'], NOW)).toThrow(
      '--scene takes known or unknown, not "other".',
    )
    expect(() => readMomentOptions(['--save', '../route-20'], NOW)).toThrow(
      '--save takes lower-case letters and digits, with single hyphens between them, not "../route-20".',
    )
    expect(() => readMomentOptions(['--minutes', '0'], NOW)).toThrow(
      '--minutes takes a positive number, not "0".',
    )
  })

  // Scene: the direct start (#97) loads a save when one is named, and writes the names given.
  it('starts the battle through the routine from boot with the save, with or without --entry', () => {
    const args = ['--save', 'route-20', '--player', 'Ann', '--opponent', 'Bo']
    expect(readMomentOptions(['--entry', 'direct', ...args], NOW)).toEqual(
      readMomentOptions(args, NOW),
    )
    expect(readMomentOptions(args, NOW)).toMatchObject({
      start: { from: 'boot', save: 'route-20' },
      entry: 'direct',
      names: { player: 'Ann', opponent: 'Bo' },
      label: 'route-20-direct-known',
    })
  })

  // Scene: a run of the direct start needs no save (plan E-6, decision 4): the page boots with
  // none, and the park writes both parties.
  it('boots with no save for --entry direct alone, and labels the run nosave', () => {
    const options = readMomentOptions(['--entry', 'direct'], NOW)
    expect(options).toMatchObject({
      start: { from: 'boot', query: '' },
      entry: 'direct',
      battle: 'single',
      label: 'nosave-direct-known',
    })
    expect(options.start).not.toHaveProperty('save')
  })

  it('plays a double with --battle double, its label ending in -double', () => {
    const args = ['--entry', 'direct', '--battle', 'double', '--scene', 'unknown']
    expect(readMomentOptions(args, NOW)).toMatchObject({
      battle: 'double',
      label: 'nosave-direct-unknown-double',
    })
    const saved = readMomentOptions([...args, '--save', 'route-20'], NOW)
    expect(saved).toMatchObject({ battle: 'double', label: 'route-20-direct-unknown-double' })
  })

  it('refuses an entry it does not know, a style it does not know and --battle for the walk', () => {
    expect(() => readMomentOptions(['--entry', 'fly', '--save', 'route-20'], NOW)).toThrow(
      '--entry takes walk or direct, not "fly".',
    )
    expect(() => readMomentOptions(['--entry', 'direct', '--battle', 'triple'], NOW)).toThrow(
      '--battle takes single or double, not "triple".',
    )
    const walk =
      "--battle is for --entry direct alone: the walk meets the save's trainer in a single."
    const walking = ['--entry', 'walk', '--save', 'route-20']
    expect(() => readMomentOptions([...walking, '--battle', 'double'], NOW)).toThrow(walk)
    expect(() => readMomentOptions(['--entry', 'walk', '--battle', 'single'], NOW)).toThrow(walk)
    expect(readMomentOptions(['--battle', 'double'], NOW)).toMatchObject({ battle: 'double' })
  })

  it('says where the session starts', () => {
    const line = (args: string[]) => startLine(readMomentOptions(args, NOW).start)
    expect(line(['--entry', 'walk'])).toBe('state s5-battle')
    expect(line(['--save', 'route-20'])).toBe('boot with the save route-20')
    expect(line([])).toBe('boot with no save')
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
    const start = readMomentOptions(['--entry', 'walk', '--save', 'route-20'], NOW).start
    const plan = firstRun(start, REFS, TRAINER, noState)
    expect(plan.steps).toEqual(continueRoute(TRAINER, CHECKS))
    expect(plan.state).toBeUndefined()
    expect(plan.stateSha).toBeUndefined()
    expect(plan.startFrame).toBe(0)
    expect(plan.watch).toEqual(WATCH)
    expect(plan.stateMarks).toEqual([])
  })

  it('ends the route at the mark battle, where the action menu stands untouched', () => {
    const start = readMomentOptions(['--entry', 'walk', '--save', 'route-20'], NOW).start
    const marks = firstRun(start, REFS, TRAINER, noState).steps.flatMap((step) =>
      step.kind === 'mark' ? [step.name] : [],
    )
    expect(marks.at(-1)).toBe('battle')
  })

  it('loads the spike state with --entry walk alone and waits two frames, as the spike did', () => {
    const read: string[] = []
    const plan = firstRun(
      readMomentOptions(['--entry', 'walk'], NOW).start,
      REFS,
      TRAINER,
      (base) => {
        read.push(base)
        return STATE
      },
    )
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
