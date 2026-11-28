// The two runs that play a Gen 5 replay (#110, #111), as the page and scripts/gen5-replay.ts queue
// them: the direct entry from power-on to the first action menu, then, once the entry ended and
// the player's adapter was read from main RAM, the play of every block from MOMENT_GAP frames
// after the entry's mark `battle`. Both runs come from src/gen5/replay-plan.ts. Pure: no Node, no
// DOM; plain Node loads it, since nothing here imports src/script/build.ts.
import { adapterNumbers } from './adapter.ts'
import type { Gen5Replay } from './backend/replay.ts'
import { battleRefs } from './battle-check.ts'
import type { Bw2Numbers } from './bw2-numbers.ts'
import type { RunPlan } from './hook.ts'
import { pkmFormat } from './pkm-members.ts'
import { BLOCK_LIMIT, replayEntry, replayPlan } from './replay-plan.ts'
import type { RoutineBuild } from './routine-order.ts'

/** Frames from the session's mark `battle` to the moment's start: room for the script's reading
 * of the battle. E-5's runs queued the moment about 35 frames after the mark on the build machine;
 * ten seconds at the DS's pace leave room for a faster core. */
export const MOMENT_GAP = 600

/** A mark of an ended run, by name and emulated frame. */
type RunMark = Readonly<{ name: string; frame: number }>

/** The frame the moment's plan starts at: MOMENT_GAP frames after the session's mark `battle`,
 * or undefined for a session with no such mark. */
export function momentStart(marks: readonly RunMark[]): number | undefined {
  const battle = marks.findLast((mark) => mark.name === 'battle')
  return battle === undefined ? undefined : battle.frame + MOMENT_GAP
}

/** The player's adapter: the word at sAdapters, read once the battle stands at the menu. */
export function playerAdapter(numbers: Bw2Numbers, read32: (address: number) => number): number {
  const symbol = numbers.symbols.sAdapters
  if (symbol === undefined) throw new Error('bw2.json names no sAdapters')
  return read32(symbol.address)
}

/** The first run: the direct entry from boot with the replay's parties and trainer names, the
 * battle's checks at its end, and the names cut in a Pokémon as notes. */
export function entryRun(
  replay: Gen5Replay,
  numbers: Bw2Numbers,
  routine: RoutineBuild,
): { plan: RunPlan; notes: string[] } {
  const refs = battleRefs(numbers)
  const entry = replayEntry(replay, {
    entry: numbers.entry,
    routine,
    format: pkmFormat(numbers),
    checks: refs.checks,
    pin: numbers.pokebw2.commit,
    gauge: numbers.gauge,
  })
  const watch = [...entry.watch, ...refs.watch]
  return { plan: { steps: entry.steps, startFrame: 0, watch, stateMarks: [] }, notes: entry.notes }
}

/** What the second run starts from: the player's adapter, the entry's marks and, when asked, a
 * frame every `every` frames while a block waits. */
interface PlayStart {
  adapter: number
  marks: readonly RunMark[]
  every?: number | undefined
}

/** The second run: every block from MOMENT_GAP frames after the entry's last mark `battle`. A
 * waiting block marks its first frame alone unless `every` asks for more. */
export function playRun(replay: Gen5Replay, numbers: Bw2Numbers, start: PlayStart): RunPlan {
  const startAt = momentStart(start.marks)
  if (startAt === undefined) throw new Error('the entry ended with no mark battle')
  const steps = replayPlan(replay, {
    adapterNumbers: adapterNumbers(numbers),
    table: numbers,
    adapter: start.adapter,
    pin: numbers.pokebw2.commit,
    markEvery: start.every ?? BLOCK_LIMIT,
  })
  return { steps, startFrame: 0, startAt, watch: battleRefs(numbers).watch, stateMarks: [] }
}
