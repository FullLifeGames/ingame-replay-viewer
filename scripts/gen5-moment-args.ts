// The command line of scripts/gen5-moment.ts (#72, #78) and the session's first run. With no flag
// the run starts as the spike's did, from the state s5-battle under build/gen5/states/. With
// --save <name> it plays one session from boot: the page fetches the save from /saves/, and the
// continue route (src/gen5/continue-route.ts) plays to the trainer's action menu, where the moment
// starts. Usage: --scene known|unknown, --save <name>, --minutes <n>.
import { parseArgs } from 'node:util'

import { continueRoute } from '../src/gen5/continue-route.ts'
import type { RunPlan } from '../src/gen5/hook.ts'
import type { RamCheck, RamRef } from '../src/gen5/ram-check.ts'
import { isSaveName } from '../src/gen5/save-file.ts'
import type { SceneName } from './gen5-moment-scene.ts'

/** The spike's state at the rival battle's action menu (#72). */
const SPIKE_STATE = 's5-battle'

/** Where the session starts: a state of the build machine, or boot with a save the page fetches. */
type MomentStart = { from: 'state'; state: string } | { from: 'boot'; save: string; query: string }

export interface MomentOptions {
  scene: SceneName
  start: MomentStart
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

const isScene = (name: string): name is SceneName => name === 'known' || name === 'unknown'

function startOf(save: string | undefined): MomentStart {
  if (save === undefined) return { from: 'state', state: SPIKE_STATE }
  if (!isSaveName(save))
    throw new Error(`--save takes lower-case letters, digits and inner hyphens, not "${save}".`)
  return { from: 'boot', save, query: `?save=${save}` }
}

export function readMomentOptions(args: string[], now: number): MomentOptions {
  const { values } = parseArgs({
    args,
    options: {
      scene: { type: 'string', default: 'known' },
      save: { type: 'string' },
      minutes: { type: 'string', default: '15' },
    },
  })
  const { scene } = values
  if (!isScene(scene)) throw new Error(`--scene takes known or unknown, not "${scene}".`)
  const minutes = Number(values.minutes)
  if (!(minutes > 0)) throw new Error(`--minutes takes a positive number, not "${values.minutes}".`)
  const start = startOf(values.save)
  const label = `${start.from === 'boot' ? start.save : 's6'}-${scene}`
  return { scene, start, label, deadlineMs: now + minutes * 60_000 }
}

/** The session's first run, which ends where the moment starts. From boot: the continue route to
 * the action menu, standing untouched at its mark `battle`, with no state loaded. From a state:
 * two frames after the load, as the spike did. No mark saves a state. */
export function firstRun(
  start: MomentStart,
  refs: { checks: readonly RamCheck[]; watch: RamRef[] },
  readState: (base: string) => StateFile,
): RunPlan {
  const { watch } = refs
  if (start.from === 'boot')
    return { steps: continueRoute(refs.checks), startFrame: 0, watch, stateMarks: [] }
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
