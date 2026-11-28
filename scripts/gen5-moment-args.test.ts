import { describe, expect, it } from 'vitest'

import type { ActorPlace } from '../src/gen5/bw2-numbers'
import { continueRoute } from '../src/gen5/continue-route'
import type { RamCheck, RamRef } from '../src/gen5/ram-check'
import { firstRun, readMomentOptions, startLine, type StateFile } from './gen5-moment-args'
import { EFFECTS_TURNS } from './gen5-moment-effects'
import { HITS_TURN } from './gen5-moment-hits'
import { SWITCHES_TURNS } from './gen5-moment-switches'

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
      team: { from: 'hand', names: { player: 'Viewer', opponent: 'Showdown' } },
      hpNumbers: 'hidden',
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
      team: { from: 'hand', names: { player: 'Viewer', opponent: 'Showdown' } },
      hpNumbers: 'shown',
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
      '--scene takes known, unknown, hits, switches or effects, not "other".',
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
      team: { from: 'hand', names: { player: 'Ann', opponent: 'Bo' } },
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

  // Scene: the direct entry hides the near box's HP numbers (#137); a scene can still show them.
  it('hides the HP numbers by default and shows them with --hp-numbers shown, in the label too', () => {
    expect(readMomentOptions(['--hp-numbers', 'hidden'], NOW)).toMatchObject({
      hpNumbers: 'hidden',
      label: 'nosave-direct-known',
    })
    expect(readMomentOptions(['--hp-numbers', 'shown', '--scene', 'unknown'], NOW)).toMatchObject({
      hpNumbers: 'shown',
      label: 'nosave-direct-unknown-hp-shown',
    })
    expect(() => readMomentOptions(['--hp-numbers', 'gone'], NOW)).toThrow(
      '--hp-numbers takes hidden or shown, not "gone".',
    )
    expect(() => readMomentOptions(['--entry', 'walk', '--hp-numbers', 'shown'], NOW)).toThrow(
      "--hp-numbers is for --entry direct alone: the walk's battle shows them.",
    )
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

  // Scene: the run takes a test replay's teams and trainer names into the direct start (#106).
  it('takes a test replay by its id for the direct entry, the id in the label', () => {
    const options = readMomentOptions(['--replay', 'gen5ou-2718717830'], NOW)
    expect(options).toMatchObject({
      start: { from: 'boot', query: '' },
      entry: 'direct',
      battle: 'single',
      team: { from: 'replay', id: 'gen5ou-2718717830' },
      label: 'nosave-direct-gen5ou-2718717830',
    })
    const saved = readMomentOptions(
      ['--replay', 'smogtours-gen5ou-862240', '--save', 'route-20'],
      NOW,
    )
    expect(saved.label).toBe('route-20-direct-smogtours-gen5ou-862240')
  })

  // Scene: the scene run of #107 plays a hand turn of the test replay's leads as blocks.
  it('plays the hits scene beside --replay alone, with -hits at the end of the label', () => {
    const options = readMomentOptions(['--replay', 'gen5ou-2718717830', '--scene', 'hits'], NOW)
    expect(options).toMatchObject({
      scene: 'hits',
      team: { from: 'replay', id: 'gen5ou-2718717830', turns: HITS_TURN },
      label: 'nosave-direct-gen5ou-2718717830-hits',
    })
    expect(readMomentOptions(['--replay', 'gen5ou-2718717830'], NOW).team).toEqual({
      from: 'replay',
      id: 'gen5ou-2718717830',
      turns: undefined,
    })
    const alone =
      "--scene hits plays hand turns after a test replay's start: give it --replay <id>."
    expect(() => readMomentOptions(['--scene', 'hits'], NOW)).toThrow(alone)
    expect(() => readMomentOptions(['--scene', 'hits', '--entry', 'walk'], NOW)).toThrow(alone)
  })

  // Scene: the scene run of #108 plays hand turns of switches, a drag and a faint as blocks.
  it('plays the switches scene beside --replay alone, with -switches at the end of the label', () => {
    const options = readMomentOptions(['--replay', 'gen5ou-2718717830', '--scene', 'switches'], NOW)
    expect(options).toMatchObject({
      scene: 'switches',
      team: { from: 'replay', id: 'gen5ou-2718717830', turns: SWITCHES_TURNS },
      label: 'nosave-direct-gen5ou-2718717830-switches',
    })
    expect(() => readMomentOptions(['--scene', 'switches'], NOW)).toThrow(
      "--scene switches plays hand turns after a test replay's start: give it --replay <id>.",
    )
  })

  // Scene: the scene run of #109 plays hand turns of a Substitute, Stealth Rock, a status, sand,
  // Leftovers and Intimidate as blocks.
  it('plays the effects scene beside --replay alone, with -effects at the end of the label', () => {
    const replay = ['--replay', 'smogtours-gen5ou-862240']
    const options = readMomentOptions([...replay, '--scene', 'effects'], NOW)
    expect(options).toMatchObject({
      scene: 'effects',
      team: { from: 'replay', id: 'smogtours-gen5ou-862240', turns: EFFECTS_TURNS },
      label: 'nosave-direct-smogtours-gen5ou-862240-effects',
    })
    expect(() => readMomentOptions(['--scene', 'effects'], NOW)).toThrow(
      "--scene effects plays hand turns after a test replay's start: give it --replay <id>.",
    )
  })

  it('refuses --replay for the walk, in a double, beside a name and with an id that climbs', () => {
    const replay = ['--replay', 'gen5ou-2718717830']
    expect(() => readMomentOptions([...replay, '--entry', 'walk'], NOW)).toThrow(
      "--replay is for --entry direct alone: the walk meets the save's trainer.",
    )
    expect(() => readMomentOptions([...replay, '--battle', 'double'], NOW)).toThrow(
      '--replay plays a single.',
    )
    const names =
      '--player and --opponent are refused with --replay: the names come from the replay.'
    expect(() => readMomentOptions([...replay, '--opponent', 'Bo'], NOW)).toThrow(names)
    expect(() => readMomentOptions([...replay, '--player', 'Ann'], NOW)).toThrow(names)
    expect(() => readMomentOptions(['--replay', '../gen5ou'], NOW)).toThrow(
      '--replay takes a test replay\'s id, lower-case letters and digits with single hyphens between them, not "../gen5ou".',
    )
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
