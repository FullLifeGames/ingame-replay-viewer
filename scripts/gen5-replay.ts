// A test replay played whole in Black 2 (#110): from power-on through our routine with the
// replay's parties and trainer names (src/gen5/replay-plan.ts' replayEntry), then, once the script
// has read the player's adapter and both parties from main RAM, the hold of the server, the
// answer to the first action menu and one block at a time to the last scene (replayPlan), from a
// fixed frame after the mark battle. The page marks each block's answer and a frame every
// --every frames while a block waits, each with its emulated frame and the hash of main RAM
// there. The log names each block's battle log lines, both parties' order at each answer
// (gen5-moment-party.ts), the battle's end, the not-shown list and the run's summary. The marks
// go to build/gen5/runs/<label>.json, and --against compares them with an earlier run's; the
// frames go under build/gen5/frames/ (gitignored, ADR 0002). Exit 1 on a failed or unfinished
// run, a party that differs from the backend's, a hash still pending, a mark that differs, a
// request the page must not make or storage left behind (gen5-moment-session.ts' withGen5Page).
// Usage: GEN5_DUMP=<path> node scripts/gen5-replay.ts --replay <id> [--run 1] [--every 30]
// [--blocks <n>] [--against <marks file>] [--minutes 90].
import { readFileSync } from 'node:fs'

import type { Page } from '@playwright/test'

import { adapterNumbers } from '../src/gen5/adapter.ts'
import { notShown } from '../src/gen5/backend/not-shown.ts'
import type { Gen5Replay } from '../src/gen5/backend/replay.ts'
import { battleRefs } from '../src/gen5/battle-check.ts'
import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import type { RunPlan, RunReport } from '../src/gen5/hook.ts'
import { MAIN_RAM_SIZE, MAIN_RAM_START } from '../src/gen5/main-ram.ts'
import { pkmFormat } from '../src/gen5/pkm-members.ts'
import { replayEntry, replayPlan } from '../src/gen5/replay-plan.ts'
import { blockLines, sideOfMon } from './gen5-moment-blocks.ts'
import { follow, hashed, hook, logReport, marksChecked } from './gen5-moment-follow.ts'
import { markLines, writeLines } from './gen5-moment-log.ts'
import { partyLines, partyRefs } from './gen5-moment-party.ts'
import { MOMENT_GAP, momentStart } from './gen5-moment-plan.ts'
import { type Battle, readBattle } from './gen5-moment-read.ts'
import {
  bootRun,
  readNumbers,
  readRoutine,
  textBanks,
  watchOf,
  withGen5Page,
} from './gen5-moment-session.ts'
import { momentTeam } from './gen5-moment-team.ts'
import { log, sampleLine } from './gen5-page.ts'
import { type ReplayOptions, readReplayOptions } from './gen5-replay-args.ts'
import { blockReport, endLines, notShownLines, runSummary } from './gen5-replay-log.ts'
import { marksFile, runExit } from './gen5-replay-exit.ts'
import type { RunMark } from './gen5-replay-marks.ts'

const hex = (value: number) => `0x${value.toString(16)}`

type Team = Awaited<ReturnType<typeof momentTeam>>

/** What a run plays with: the dump, the numbers, the options and an earlier run's marks. */
interface Run {
  dump: string
  numbers: Bw2Numbers
  options: ReplayOptions
  against: RunMark[] | undefined
}

/** The test replay's team with its fallbacks logged, and its Gen 5 replay cut to the first
 * --blocks blocks. */
async function replayOf(numbers: Bw2Numbers, options: ReplayOptions) {
  const team = await momentTeam(options.team, numbers)
  const whole = team.replay
  if (whole === undefined) throw new Error(`the test replay ${options.team.id} gave no blocks`)
  for (const { line, kind, detail } of team.fallbacks) {
    log(`team: line ${String(line)}, ${kind}: ${detail}`)
  }
  const blocks = whole.blocks.slice(0, options.blocks ?? whole.blocks.length)
  log(`replay: ${String(blocks.length)} of ${String(whole.blocks.length)} blocks`)
  return { team, replay: { ...whole, blocks } }
}

/** The first run: the direct entry from power-on with the replay's parties and names, logged. */
function entryPlan(numbers: Bw2Numbers, replay: Gen5Replay): RunPlan {
  const refs = battleRefs(numbers)
  const entry = replayEntry(replay, {
    entry: numbers.entry,
    routine: readRoutine(),
    format: pkmFormat(numbers),
    checks: refs.checks,
    pin: numbers.pokebw2.commit,
  })
  for (const note of entry.notes) log(`name cut: ${note}`)
  log(`entry direct: ${String(entry.steps.length)} steps from boot with no save`)
  for (const line of writeLines(entry.steps)) log(line)
  return {
    steps: entry.steps,
    startFrame: 0,
    watch: [...entry.watch, ...refs.watch],
    stateMarks: [],
  }
}

/** The battle read from main RAM at the action menu, the parties against the team written. */
async function battleOf(page: Page, numbers: Bw2Numbers, team: Team): Promise<Battle> {
  await hook(page).uncapped()
  const base64 = await hook(page).readBytes(MAIN_RAM_START, MAIN_RAM_SIZE)
  const battle = readBattle(new Uint8Array(Buffer.from(base64, 'base64')), numbers, team.written)
  log(`adapter ${hex(battle.adapter)}, server ${hex(battle.server)}`)
  return battle
}

/** The second run: the replay's play from MOMENT_GAP frames after the first run's mark battle,
 * with both parties' slots read at every mark. */
function playPlan(run: Run, battle: Battle, replay: Gen5Replay, first: RunReport): RunPlan {
  const { numbers, options } = run
  const steps = replayPlan(replay, {
    adapterNumbers: adapterNumbers(numbers),
    table: numbers,
    adapter: battle.adapter,
    pin: numbers.pokebw2.commit,
    markEvery: options.every,
  })
  for (const line of writeLines(steps)) log(line)
  const startAt = momentStart(first.marks)
  if (startAt === undefined) throw new Error('the session ended with no mark battle')
  log(
    `replay: starts at frame ${String(startAt)}, ${String(MOMENT_GAP)} frames after the mark battle`,
  )
  const refs = { watch: watchOf(numbers, battle), markRefs: partyRefs(battle, numbers) }
  return { steps, startFrame: 0, startAt, ...refs, stateMarks: [] }
}

/** The marks, the blocks, the parties, the end and the not-shown list, logged; false when a
 * party differs from the backend's. */
function logPlay(report: RunReport, battle: Battle, team: Team, replay: Gen5Replay): boolean {
  for (const line of markLines(report.marks)) log(line)
  for (const line of blockReport(replay.blocks, report.marks, team.lines)) log(line)
  const party = partyLines(replay.blocks, report.marks, battle.parties, team.orders)
  for (const line of party.lines) log(`party ${line}`)
  if (!party.matches) log("party: the client's party order differs from the state's")
  if (team.end !== undefined) for (const line of endLines(team.end)) log(line)
  for (const line of notShownLines(notShown(team.fallbacks))) log(line)
  return party.matches
}

async function play(page: Page, run: Run): Promise<number> {
  const began = Date.now()
  const { numbers, options } = run
  const { team, replay } = await replayOf(numbers, options)
  const until = { label: options.label, deadlineMs: options.deadlineMs }
  const first = await bootRun(page, run.dump, entryPlan(numbers, replay), until)
  logReport(first)
  if (first.status !== 'done') return 1
  const battle = await battleOf(page, numbers, team)
  const sideOf = sideOfMon(battle.parties)
  for (const line of blockLines(replay, { banks: textBanks(), sideOf })) log(line)
  await hook(page).queueRun(playPlan(run, battle, replay, first))
  const followed = await follow(page, until.label, until.deadlineMs, first.marks.length)
  const report = await hashed(page, followed)
  logReport(report)
  const party = logPlay(report, battle, team, replay)
  const marks = marksChecked(options.label, report, run.against)
  log(runSummary(replay.blocks, report.marks, Date.now() - began))
  return runExit({ status: report.status, party, marks })
}

async function main(): Promise<void> {
  const options = readReplayOptions(process.argv.slice(2), Date.now())
  const dump = process.env.GEN5_DUMP
  if (!dump) throw new Error('set GEN5_DUMP to the path of the Black 2 (USA) dump')
  const against =
    options.against === undefined
      ? undefined
      : marksFile(readFileSync(options.against, 'utf8'), options.against)
  log(`gen5-replay: ${JSON.stringify(options)}; ${sampleLine()}`)
  const numbers = readNumbers()
  await withGen5Page('', (page) => play(page, { dump, numbers, options, against }))
}

if (import.meta.main) await main()
