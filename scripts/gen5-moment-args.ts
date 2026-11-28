// The command line of scripts/gen5-moment.ts (#72, #78, #97) and the session's first run. By
// default the routine starts the battle from boot (gen5-moment-direct.ts, D16), with the names of
// --player and --opponent and the team of gen5-moment-team.ts; with no --save the page boots with
// no save at all, and --battle double plays a double. With --entry walk the session walks as #78
// did: from --save <name> the page fetches the save from /saves/, and the continue route
// (src/gen5/continue-route.ts) plays to the trainer's action menu, where the moment starts; with
// no save it starts as the spike's did, from the state s5-battle under build/gen5/states/. With
// --replay <id> the direct entry writes a test replay's teams and trainer names (#106), and with
// --scene hits, switches or effects beside it the run plays hand turns after the replay's start as
// blocks (#107, #108, #109). The direct entry hides the near box's HP numbers (#137) unless
// --hp-numbers shown asks to show them.
// Usage: --scene known|unknown|hits|switches|effects, --save <name>, --entry direct|walk,
// --battle single|double, --player <name>, --opponent <name>, --replay <id>,
// --hp-numbers hidden|shown, --minutes <n>.
import { parseArgs } from 'node:util'

import type { ActorPlace } from '../src/gen5/bw2-numbers.ts'
import { continueRoute } from '../src/gen5/continue-route.ts'
import type { RunPlan } from '../src/gen5/hook.ts'
import type { ParkNames, ParkSides } from '../src/gen5/direct-park.ts'
import type { RamCheck, RamRef } from '../src/gen5/ram-check.ts'
import { isSaveName, SAVE_NAME_RULE } from '../src/gen5/save-file.ts'
import { HITS_TURN } from './gen5-moment-hits.ts'
import { EFFECTS_TURNS } from './gen5-moment-effects.ts'
import type { SceneName } from './gen5-moment-scene.ts'
import { SWITCHES_TURNS } from './gen5-moment-switches.ts'

/** The spike's state at the rival battle's action menu (#72). */
const SPIKE_STATE = 's5-battle'

/** Where the session starts: a state of the build machine, or boot, with a save the page fetches
 * or, for the direct entry, with none. */
type MomentStart = { from: 'state'; state: string } | { from: 'boot'; save?: string; query: string }

/** How the session reaches the battle: the routine from boot (the default), or the continue
 * route's walk. */
type MomentEntry = 'walk' | 'direct'

/** The direct entry's battle style. */
type MomentBattle = ParkSides['style']

/** Whether the direct entry hides the near box's HP numbers. */
type MomentHpNumbers = 'hidden' | 'shown'

/** The scenes that play hand turns after a test replay's start, each with its turns. */
const HAND_TURNS = { hits: HITS_TURN, switches: SWITCHES_TURNS, effects: EFFECTS_TURNS } as const

/** A scene of hand turns after a test replay's start. */
type HandScene = keyof typeof HAND_TURNS

/** What the direct entry writes: the hand team of gen5-moment-team.ts with the names given, or
 * the teams and trainer names of the test replay `id` (test/fixtures/replays/), with a hand
 * scene's `turns` in place of the replay's turns. */
export type MomentTeam =
  | { from: 'hand'; names: ParkNames }
  | { from: 'replay'; id: string; turns: readonly string[] | undefined }

/** A scene of the moment's blocks, or a hand scene: the blocks of a replay's hand turns. */
export type MomentScene = SceneName | HandScene

export interface MomentOptions {
  scene: MomentScene
  start: MomentStart
  entry: MomentEntry
  battle: MomentBattle
  /** The team the direct entry writes, and its names. */
  team: MomentTeam
  /** Whether the direct entry hides the near box's HP numbers; the walk shows them. */
  hpNumbers: MomentHpNumbers
  /** The prefix of the run's frames and states. */
  label: string
  deadlineMs: number
}

/** A state under build/gen5/states/: the core's state in base64 and the mark it was saved at. */
export interface StateFile {
  state: string
  frame: number
  ramSha: string | undefined
}

/** Whether `scene` plays hand turns after a test replay's start. */
export const isHandScene = (scene: string): scene is HandScene => Object.hasOwn(HAND_TURNS, scene)
const isScene = (name: string): name is MomentScene =>
  name === 'known' || name === 'unknown' || isHandScene(name)
const isEntry = (name: string): name is MomentEntry => name === 'walk' || name === 'direct'
const isBattle = (name: string): name is MomentBattle => name === 'single' || name === 'double'

function entryOf(entry: string): MomentEntry {
  if (!isEntry(entry)) throw new Error(`--entry takes walk or direct, not "${entry}".`)
  return entry
}

/** The style, which the direct entry alone writes: the walk meets the save's trainer. */
function battleOf(battle: string | undefined, entry: MomentEntry): MomentBattle {
  if (battle === undefined) return 'single'
  if (entry === 'walk') {
    throw new Error(
      "--battle is for --entry direct alone: the walk meets the save's trainer in a single.",
    )
  }
  if (!isBattle(battle)) throw new Error(`--battle takes single or double, not "${battle}".`)
  return battle
}

/** Hidden by default for the direct entry, which alone writes them: the walk shows them. */
function hpNumbersOf(given: string | undefined, entry: MomentEntry): MomentHpNumbers {
  if (given === undefined) return entry === 'direct' ? 'hidden' : 'shown'
  if (entry === 'walk') {
    throw new Error("--hp-numbers is for --entry direct alone: the walk's battle shows them.")
  }
  if (given !== 'hidden' && given !== 'shown') {
    throw new Error(`--hp-numbers takes hidden or shown, not "${given}".`)
  }
  return given
}

/** With no save the walk starts from the spike's state, and the direct entry boots with none. */
function startOf(save: string | undefined, entry: MomentEntry): MomentStart {
  if (save === undefined) {
    return entry === 'direct' ? { from: 'boot', query: '' } : { from: 'state', state: SPIKE_STATE }
  }
  if (!isSaveName(save)) throw new Error(`--save takes ${SAVE_NAME_RULE}, not "${save}".`)
  return { from: 'boot', save, query: `?save=${save}` }
}

/** A test replay's id: lower-case letters and digits with single hyphens between them. */
const REPLAY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** The hand team with the names given or their defaults; a hand scene needs a replay. */
function handTeam(scene: MomentScene, player?: string, opponent?: string): MomentTeam {
  if (isHandScene(scene)) {
    const needs = "plays hand turns after a test replay's start: give it --replay <id>."
    throw new Error(`--scene ${scene} ${needs}`)
  }
  return { from: 'hand', names: { player: player ?? 'Viewer', opponent: opponent ?? 'Showdown' } }
}

/** The hand team with the names given or their defaults, or the replay, which brings its own
 * names and plays a single of the direct entry; a hand scene needs the replay. */
function teamOf(
  values: {
    scene: MomentScene
    replay?: string | undefined
    player?: string | undefined
    opponent?: string | undefined
  },
  entry: MomentEntry,
  battle: MomentBattle,
): MomentTeam {
  const { scene, replay: id, player, opponent } = values
  if (id === undefined) return handTeam(scene, player, opponent)
  if (entry !== 'direct') {
    throw new Error("--replay is for --entry direct alone: the walk meets the save's trainer.")
  }
  if (battle === 'double') throw new Error('--replay plays a single.')
  if (player !== undefined || opponent !== undefined) {
    throw new Error(
      '--player and --opponent are refused with --replay: the names come from the replay.',
    )
  }
  if (!REPLAY_ID.test(id)) {
    const rule = 'lower-case letters and digits with single hyphens between them'
    throw new Error(`--replay takes a test replay's id, ${rule}, not "${id}".`)
  }
  return { from: 'replay', id, turns: isHandScene(scene) ? HAND_TURNS[scene] : undefined }
}

/** The prefix of the run's frames: the save or nosave, or s6 from the state, then the entry, and
 * the replay's id with a hand scene's name or the scene, and a double's mark. */
function labelOf(start: MomentStart, entry: MomentEntry, scene: MomentScene, team: MomentTeam) {
  const from = start.from === 'boot' ? (start.save ?? 'nosave') : 's6'
  const via = entry === 'direct' ? '-direct' : ''
  if (team.from === 'hand') return `${from}${via}-${scene}`
  return `${from}${via}-${team.id}${isHandScene(scene) ? `-${scene}` : ''}`
}

/** The label's ends: a double's mark, and the direct entry's numbers shown by choice. */
const marksOf = (battle: MomentBattle, entry: MomentEntry, hpNumbers: MomentHpNumbers) =>
  `${battle === 'double' ? '-double' : ''}${entry === 'direct' && hpNumbers === 'shown' ? '-hp-shown' : ''}`

export function readMomentOptions(args: string[], now: number): MomentOptions {
  const { values } = parseArgs({
    args,
    options: {
      scene: { type: 'string', default: 'known' },
      save: { type: 'string' },
      minutes: { type: 'string', default: '15' },
      entry: { type: 'string', default: 'direct' },
      battle: { type: 'string' },
      player: { type: 'string' },
      opponent: { type: 'string' },
      replay: { type: 'string' },
      'hp-numbers': { type: 'string' },
    },
  })
  const { scene } = values
  if (!isScene(scene))
    throw new Error(`--scene takes known, unknown, hits, switches or effects, not "${scene}".`)
  const minutes = Number(values.minutes)
  if (!(minutes > 0)) throw new Error(`--minutes takes a positive number, not "${values.minutes}".`)
  const entry = entryOf(values.entry)
  const start = startOf(values.save, entry)
  const battle = battleOf(values.battle, entry)
  const team = teamOf({ ...values, scene }, entry, battle)
  const hpNumbers = hpNumbersOf(values['hp-numbers'], entry)
  const label = `${labelOf(start, entry, scene, team)}${marksOf(battle, entry, hpNumbers)}`
  return { scene, start, entry, battle, team, hpNumbers, label, deadlineMs: now + minutes * 60_000 }
}

/** Where the session starts, for the log. */
export function startLine(start: MomentStart): string {
  if (start.from === 'state') return `state ${start.state}`
  return start.save === undefined ? 'boot with no save' : `boot with the save ${start.save}`
}

/** The session's first run, which ends where the moment starts. From boot: the continue route to
 * the action menu of the battle with `trainer`, the save's trainer, standing untouched at its mark
 * `battle`, with no state loaded. From a state: two frames after the load, as the spike did. No
 * mark saves a state. */
export function firstRun(
  start: MomentStart,
  refs: { checks: readonly RamCheck[]; watch: RamRef[] },
  trainer: ActorPlace,
  readState: (base: string) => StateFile,
): RunPlan {
  const { watch } = refs
  if (start.from === 'boot')
    return { steps: continueRoute(trainer, refs.checks), startFrame: 0, watch, stateMarks: [] }
  const file = readState(start.state)
  return {
    steps: [{ kind: 'wait', frames: 2 }],
    state: file.state,
    stateSha: file.ramSha,
    startFrame: file.frame,
    watch,
    stateMarks: [],
  }
}
