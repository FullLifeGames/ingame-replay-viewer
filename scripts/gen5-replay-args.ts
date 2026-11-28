// The command line of scripts/gen5-replay.ts (#110): the test replay to play whole from power-on,
// the run's number, a frame every so many frames while a block waits, the first blocks alone for
// a smoke run, and the marks file of an earlier run to compare with. The replay's id, the label
// and the deadline come from the moment script's rules (gen5-moment-args.ts).
// Usage: --replay <id>, --run <n>, --every <frames>, --blocks <n>, --against <marks file>,
// --minutes <n>.
import { parseArgs } from 'node:util'

import { type MomentTeam, readMomentOptions } from './gen5-moment-args.ts'

/** Frames between two frames of a block while it waits, by default (lane plan D10); the shot
 * scene of the page's own replay asks the page for the same, so the two runs' marks compare. */
export const EVERY = 30

export interface ReplayOptions {
  team: Extract<MomentTeam, { from: 'replay' }>
  /** The prefix of the run's frames and the name of its marks file. */
  label: string
  deadlineMs: number
  run: number
  every: number
  /** The first this many blocks alone; all of them when not given. */
  blocks: number | undefined
  /** The marks file of an earlier run to compare with. */
  against: string | undefined
}

/** A whole number from 1. */
function wholeOf(option: string, value: string): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`--${option} takes a whole number from 1, not "${value}".`)
  }
  return number
}

export function readReplayOptions(args: string[], now: number): ReplayOptions {
  const { values } = parseArgs({
    args,
    options: {
      replay: { type: 'string' },
      minutes: { type: 'string', default: '90' },
      run: { type: 'string', default: '1' },
      every: { type: 'string', default: String(EVERY) },
      blocks: { type: 'string' },
      against: { type: 'string' },
    },
  })
  const { replay, minutes } = values
  if (replay === undefined) {
    throw new Error('gen5-replay plays a test replay: give it --replay <id>.')
  }
  const moment = readMomentOptions(['--replay', replay, '--minutes', minutes], now)
  if (moment.team.from !== 'replay') throw new Error('the moment script dropped the replay')
  const run = wholeOf('run', values.run)
  return {
    team: moment.team,
    label: `${moment.label}-replay-r${String(run)}`,
    deadlineMs: moment.deadlineMs,
    run,
    every: wholeOf('every', values.every),
    blocks: values.blocks === undefined ? undefined : wholeOf('blocks', values.blocks),
    against: values.against,
  }
}
