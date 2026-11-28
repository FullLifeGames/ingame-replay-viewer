// The S6 run of the Gen 5 spike (#72), its run from the shipped save (#78) and the direct start
// (#97): one battle moment driven from outside. It starts the session as gen5-moment-args.ts
// says, as one plan: by default through our routine from boot, with a save or none, the park
// writing the team of gen5-moment-team.ts or with --replay a test replay's (gen5-moment-direct.ts);
// with --entry walk from boot with a save the page fetches from /saves/ and the continue route to
// the trainer's action menu, or from the spike's battle state. A double's run and a replay's end
// after the readings at the action menu: the moment is a single's with leads that know Tackle.
// Then it reads the player's adapter, the server and both Pokémon from main RAM and plays the
// steps of gen5-moment-plan.ts from a fixed frame after the mark battle: hold the server, answer
// the action menu and write one block per moment. With --replay and --scene hits, switches or
// effects it writes the blocks of hand turns after the replay's start instead
// (gen5-moment-blocks.ts, #107 to #109), each logged with its commands and lines, and at each
// block's answer it checks both parties' order in RAM against the backend's
// (gen5-moment-party.ts). It writes a frame per mark under build/gen5/frames/ and the last mark's
// state under build/gen5/states/ (gitignored, ADR 0002).
// Usage: GEN5_DUMP=<path> node scripts/gen5-moment.ts
// [--scene known|unknown|hits|switches|effects] [--save <name>] [--entry direct|walk]
// [--battle single|double] [--player <name>] [--opponent <name>] [--replay <id>] [--minutes 15].
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from '@playwright/test'

import { adapterNumbers } from '../src/gen5/adapter.ts'
import { battleRefs } from '../src/gen5/battle-check.ts'
import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import type { PartyOrders } from '../src/gen5/backend/moves.ts'
import type { Gen5Replay } from '../src/gen5/backend/replay.ts'
import type { RunPlan, RunReport } from '../src/gen5/hook.ts'
import type { MacroStep } from '../src/gen5/macro.ts'
import { MAIN_RAM_SIZE, MAIN_RAM_START } from '../src/gen5/main-ram.ts'
import {
  isHandScene,
  type MomentOptions,
  readMomentOptions,
  startLine,
  type StateFile,
} from './gen5-moment-args.ts'
import { blocksScene } from './gen5-moment-blocks.ts'
import { sessionPlan } from './gen5-moment-direct.ts'
import { follow, hook, logReport } from './gen5-moment-follow.ts'
import { partyLines, partyRefs } from './gen5-moment-party.ts'
import { type Battle, readBattle } from './gen5-moment-read.ts'
import { momentTeam } from './gen5-moment-team.ts'
import { markLines, writeLines } from './gen5-moment-log.ts'
import { MOMENT_GAP, momentStart, momentSteps } from './gen5-moment-plan.ts'
import {
  sceneBlocks,
  sceneLineLabel,
  type SceneName,
  textId,
  textLine,
} from './gen5-moment-scene.ts'
import {
  bootRun,
  pickDump,
  readNumbers,
  readRoutine,
  textBanks,
  watchOf,
  withGen5Page,
} from './gen5-moment-session.ts'
import { log, sampleLine } from './gen5-page.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

const hex = (value: number) => `0x${value.toString(16)}`

type Team = Awaited<ReturnType<typeof momentTeam>>

/** The session's options and the direct entry's team. */
interface Session {
  options: MomentOptions
  team: Team | undefined
}

function readStateFile(base: string): StateFile {
  const meta = JSON.parse(readFileSync(join(GEN5_PATHS.states, `${base}.json`), 'utf8')) as {
    frame: number
    ramSha: string | undefined
  }
  const state = readFileSync(join(GEN5_PATHS.states, `${base}.state`)).toString('base64')
  return { state, frame: meta.frame, ramSha: meta.ramSha }
}

/** Picks the dump and plays the session's plan to where the moment starts. A run from boot is
 * queued before the pick, so it counts from the first frame; a run from a state once the game is
 * up. */
async function startSession(page: Page, dump: string, numbers: Bw2Numbers, session: Session) {
  const { options, team } = session
  const { start, label, deadlineMs } = options
  const { plan, notes, hpNumbers } = sessionPlan(options, {
    refs: battleRefs(numbers),
    trainer: numbers.saveTrainer,
    entry: numbers.entry,
    gauge: numbers.gauge,
    readRoutine,
    readState: readStateFile,
    team,
  })
  for (const note of notes) log(`name cut: ${note}`)
  log(hpNumbers)
  log(`entry ${options.entry}: ${String(plan.steps.length)} steps from ${startLine(start)}`)
  for (const line of writeLines(plan.steps)) log(line)
  if (start.from === 'boot') return bootRun(page, dump, plan, { label, deadlineMs })
  await pickDump(page, dump)
  await hook(page).queueRun(plan)
  return follow(page, label, deadlineMs)
}

/** The direct entry's team, its fallbacks and cut names logged; the walk writes none. */
async function sessionTeam(numbers: Bw2Numbers, options: MomentOptions) {
  if (options.entry !== 'direct') return undefined
  const team = await momentTeam(options.team, numbers)
  for (const { line, kind, detail } of team.fallbacks) {
    log(`team: line ${String(line)}, ${kind}: ${detail}`)
  }
  for (const note of team.notes) log(`team: ${note}`)
  return team
}

/** The scene's blocks for the battle read, each logged with the move line it shows. */
function sceneMoments(scene: SceneName, battle: Battle, numbers: Bw2Numbers) {
  const banks = textBanks()
  const std = textId(banks.standard, 'Bank0019_Text_ItsSuperEffective')
  const blocks = sceneBlocks(scene, battle, numbers.battle.single, std)
  for (const { name, moment } of blocks) {
    const side = moment.attacker.monId === battle.near.monId ? 'near' : 'far'
    const line = sceneLineLabel(scene, side, banks.move)
    log(
      `${name}: ${JSON.stringify(moment)}; ${line}: ${textLine(banks.move, textId(banks.move, line))}`,
    )
  }
  log(`standard line ${String(std)}: ${textLine(banks.standard, std)}`)
  return blocks
}

/** A hand scene's steps: the replay's blocks, each logged with its commands and lines. */
function handSteps(team: Team | undefined, battle: Battle, numbers: Bw2Numbers): MacroStep[] {
  const { steps, lines } = blocksScene(team?.replay, { numbers, battle, banks: textBanks() })
  for (const line of lines) log(line)
  return steps
}

/** The second run's steps: a hand scene's blocks or the moment's; none for a double or a
 * replay with no scene, whose run ends at the action menu. */
function secondSteps(options: MomentOptions, battle: Battle, numbers: Bw2Numbers, team?: Team) {
  const { scene } = options
  if (isHandScene(scene)) return handSteps(team, battle, numbers)
  const atMenu = options.team.from === 'replay' ? 'replay' : options.battle
  if (atMenu !== 'single') {
    log(`${atMenu}: the run ends at the action menu`)
    return undefined
  }
  return momentSteps({
    adapterNumbers: adapterNumbers(numbers),
    table: numbers,
    adapter: battle.adapter,
    blocks: sceneMoments(scene, battle, numbers),
  })
}

/** The second run: its steps, logged, from MOMENT_GAP frames after the first run's mark battle,
 * with the values it watches and those it reads at each mark. */
function secondPlan(
  steps: MacroStep[],
  first: RunReport,
  refs: Pick<RunPlan, 'watch' | 'markRefs'>,
): RunPlan {
  for (const line of writeLines(steps)) log(line)
  const startAt = momentStart(first.marks)
  log(
    startAt === undefined
      ? 'moment: starts once queued, as the session has no mark battle'
      : `moment: starts at frame ${String(startAt)}, ${String(MOMENT_GAP)} frames after the mark battle`,
  )
  return {
    steps,
    startFrame: 0,
    ...(startAt === undefined ? {} : { startAt }),
    ...refs,
    stateMarks: ['end'],
  }
}

/** A hand scene's replay with the party orders the writer keeps after each event; undefined
 * for every other run. */
function handScene(
  options: MomentOptions,
  team: Awaited<ReturnType<typeof sessionTeam>>,
): { replay: Gen5Replay; orders: readonly PartyOrders[] } | undefined {
  const replay = isHandScene(options.scene) ? team?.replay : undefined
  return replay === undefined || team === undefined ? undefined : { replay, orders: team.orders }
}

/** The party lines of a hand scene's run, each block's orders read from RAM against the orders
 * the writer keeps (gen5-moment-party.ts); false on a mismatch. A run with no hand scene checks
 * nothing. */
function partyChecked(
  hand: ReturnType<typeof handScene>,
  report: RunReport,
  battle: Battle,
): boolean {
  if (hand === undefined) return true
  const { lines, matches } = partyLines(
    hand.replay.blocks,
    report.marks,
    battle.parties,
    hand.orders,
  )
  for (const line of lines) log(`party ${line}`)
  if (!matches) log("party: the client's party order differs from the state's")
  return matches
}

async function play(page: Page, dump: string, numbers: Bw2Numbers, options: MomentOptions) {
  const { label, deadlineMs } = options
  const team = await sessionTeam(numbers, options)
  const first = await startSession(page, dump, numbers, { options, team })
  logReport(first)
  if (first.status !== 'done') return 1
  await hook(page).uncapped()
  const base64 = await hook(page).readBytes(MAIN_RAM_START, MAIN_RAM_SIZE)
  const ram = new Uint8Array(Buffer.from(base64, 'base64'))
  const battle = readBattle(ram, numbers, team?.written)
  log(`adapter ${hex(battle.adapter)}, server ${hex(battle.server)}`)
  const steps = secondSteps(options, battle, numbers, team)
  if (steps === undefined) return 0
  const hand = handScene(options, team)
  const markRefs = hand === undefined ? [] : partyRefs(battle, numbers)
  const second = secondPlan(steps, first, { watch: watchOf(numbers, battle), markRefs })
  await hook(page).queueRun(second)
  const report = await follow(page, label, deadlineMs, first.marks.length)
  logReport(report)
  for (const line of markLines(report.marks)) log(line)
  const party = partyChecked(hand, report, battle)
  return report.status === 'done' && party ? 0 : 1
}

async function main(): Promise<void> {
  const options = readMomentOptions(process.argv.slice(2), Date.now())
  const dump = process.env.GEN5_DUMP
  if (!dump) throw new Error('set GEN5_DUMP to the path of the Black 2 (USA) dump')
  log(`gen5-moment: ${JSON.stringify(options)}; ${sampleLine()}`)
  const numbers = readNumbers()
  const query = options.start.from === 'boot' ? options.start.query : ''
  await withGen5Page(query, (page) => play(page, dump, numbers, options))
}

if (import.meta.main) await main()
