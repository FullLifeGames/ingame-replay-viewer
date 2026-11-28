// The steps that play a Gen 5 replay (#107, #110, #118): the direct entry from power-on with the
// replay's parties and trainer names, then the hold of the server, the player's answer to the
// first action menu, and each block once the client answered the one before, with no button press
// between. A printed block writes its page into the text box over the carrier line
// (src/gen5/text-box.ts) once the client formatted it. After the last block nothing is written
// and the game holds the last scene. Both plans refuse a replay of another format version or
// built on another pokebw2 pin than the numbers they write with, before any step. The moment
// script (scripts/gen5-moment-plan.ts) and its hand scenes (scripts/gen5-moment-blocks.ts) write
// through the same steps, and the page plays them frame by frame. Pure: no Node, no DOM.
import { type AdapterNumbers, adapterWrites, holdWrites } from './adapter.ts'
import { sealParties } from './backend/party-mon.ts'
import { type Gen5Block, GEN5_REPLAY_VERSION, type Gen5Replay } from './backend/replay.ts'
import type { GaugeNumbers } from './bw2-gauge-numbers.ts'
import type { EntryNumbers, ServerCmdTable, TextBoxNumbers } from './bw2-numbers.ts'
import { type DirectEntry, directEntry } from './direct-entry.ts'
import { mark, type MacroStep, wait } from './macro.ts'
import type { PkmFormat } from './pkm-members.ts'
import type { RamCheck } from './ram-check.ts'
import type { RoutineBuild } from './routine-order.ts'
import { packCommands } from './server-cmd.ts'
import { armWrites, formattedCheck, pageWrites, TEXT_LIMIT, textBox } from './text-box.ts'

/** Frames the player's answer to the menu may take; A every MASH_EVERY frames for 3. */
const MENU_LIMIT = 1800
const MASH_EVERY = 30
/** Frames the game holds the last scene after the last block's answer. */
const LAST_SCENE_FRAMES = 300

/** Frames a block may take, and a frame of it every BLOCK_FRAMES_EVERY frames. */
export const BLOCK_LIMIT = 3000
const BLOCK_FRAMES_EVERY = 10

/** Where the blocks go: the adapter's numbers, the command table and the player's adapter, read
 * from sAdapters. */
export interface BlockSetup {
  adapterNumbers: AdapterNumbers
  table: ServerCmdTable
  adapter: number
}

/** A block setup on the numbers of one pokebw2 commit. */
interface ReplaySetup extends BlockSetup {
  /** The pokebw2 commit of the numbers. */
  pin: string
  /** A frame every this many frames while a block waits; BLOCK_FRAMES_EVERY when not given. */
  markEvery?: number
}

/** The check that the client answered its last command: `returned` reads 1 at the adapter. */
export function answered(setup: BlockSetup): RamCheck {
  const field = setup.adapterNumbers.layout.fields.returned
  if (field?.size !== 1) throw new Error("the adapter's returned must sit in one byte")
  const mask = (2 ** (field.bits ?? 8) - 1) * 2 ** (field.bit ?? 0)
  const address = setup.adapter + field.offset
  return { name: 'returned', address, width: 1, mask, oneOf: [2 ** (field.bit ?? 0)] }
}

/** A block to write: its name, the log lines it shows (none for a moment's block), its commands
 * and, for a printed block, its page. */
type PlanBlock = Pick<Gen5Block, 'name' | 'commands'> & {
  readonly lines?: readonly number[]
  readonly print?: string | undefined
}

/** The block's name, with its log lines when it has any. */
const labelOf = ({ name, lines }: PlanBlock) =>
  lines === undefined ? name : `${name} (lines ${lines.join(', ')})`

/** `writes()`, or its RangeError named by the block, with the error as the cause. */
function named<T>(block: PlanBlock, writes: () => T): T {
  try {
    return writes()
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    throw new RangeError(`${labelOf(block)}: ${error.message}`, { cause: error })
  }
}

/** The writes of one block; a block past the adapter's room fails by its name and lines, with the
 * adapter's error as the cause. */
function namedWrites(setup: BlockSetup, block: PlanBlock) {
  const packed = packCommands(setup.table, block.commands)
  return named(block, () => adapterWrites(setup.adapterNumbers, setup.adapter, packed))
}

type StepSetup = BlockSetup & Pick<ReplaySetup, 'markEvery'>

/** The wait for the client's answer to the block `name`, and the mark `<name>-answered`. */
function answerSteps(setup: StepSetup, name: string): MacroStep[] {
  return [
    {
      kind: 'until',
      name,
      checks: [answered(setup)],
      holdFor: 1,
      limit: BLOCK_LIMIT,
      markEvery: setup.markEvery ?? BLOCK_FRAMES_EVERY,
    },
    { kind: 'mark', name: `${name}-answered` },
  ]
}

/** The steps of a printed block (#118, lane plan section 2): the box's guard, which holds at
 * once; the arm with the carrier's block; the wait for the client's format with the guard again;
 * the page written over the carrier before the paused stream reads it; then the answer. */
function printSteps(setup: StepSetup, block: PlanBlock, page: string, box: TextBoxNumbers) {
  const { name } = block
  const { guard } = textBox(box)
  const steps: MacroStep[] = [
    { kind: 'until', name: `${name}-box`, checks: guard, holdFor: 1, limit: 1 },
    { kind: 'write', name, writes: [...armWrites(box), ...namedWrites(setup, block)] },
    {
      kind: 'until',
      name: `${name}-text`,
      checks: [...guard, formattedCheck(box)],
      holdFor: 1,
      limit: TEXT_LIMIT,
    },
    { kind: 'write', name: `${name}-text`, writes: named(block, () => pageWrites(box, page)) },
  ]
  return [...steps, ...answerSteps(setup, name)]
}

/** The steps of one block: its write, the wait for the client's answer, and the mark
 * `<name>-answered`; a printed block's through the text box `box`, and without one it throws by
 * the block's name. */
export function blockSteps(setup: StepSetup, block: PlanBlock, box?: TextBoxNumbers): MacroStep[] {
  const { name, print } = block
  if (print === undefined) {
    return [{ kind: 'write', name, writes: namedWrites(setup, block) }, ...answerSteps(setup, name)]
  }
  if (box === undefined) {
    throw new Error(`${labelOf(block)} prints a page, but the replay carries no text box`)
  }
  return printSteps(setup, block, print, box)
}

/** Throws by name unless the replay has this plan's version and was built on `pin`. */
export function checkReplay(replay: Pick<Gen5Replay, 'version' | 'pin'>, pin: string): void {
  if (replay.version !== GEN5_REPLAY_VERSION) {
    const reads = `this plan reads version ${String(GEN5_REPLAY_VERSION)}`
    throw new Error(`a Gen 5 replay of version ${String(replay.version)}; ${reads}`)
  }
  if (replay.pin !== pin) {
    throw new Error(`a replay built on pokebw2 ${replay.pin}, the numbers are of ${pin}`)
  }
}

/** The steps of each of the replay's blocks in order, once the replay is checked. */
export function replaySteps(replay: Gen5Replay, setup: ReplaySetup): MacroStep[] {
  checkReplay(replay, setup.pin)
  return replay.blocks.flatMap((block) => blockSteps(setup, block, replay.textBox))
}

/** The steps before the first block: hold the server, let the player answer the action menu by
 * A, and mark the HP before. */
export function menuSteps(setup: BlockSetup): MacroStep[] {
  const { adapterNumbers, adapter } = setup
  return [
    { kind: 'write', name: 'hold', writes: holdWrites(adapterNumbers, adapter) },
    {
      kind: 'until',
      name: 'answer-menu',
      checks: [answered(setup)],
      holdFor: 1,
      limit: MENU_LIMIT,
      mash: { buttons: ['A'], every: MASH_EVERY, hold: 3 },
      markEvery: MASH_EVERY,
    },
    { kind: 'mark', name: 'hp-before' },
  ]
}

/** The play of a whole replay from the action menu, once the replay is checked: the menu's
 * answer, each block, the mark `end`, then the last scene held with no write and the mark
 * `last-scene`. */
export function replayPlan(replay: Gen5Replay, setup: ReplaySetup): MacroStep[] {
  const blocks = replaySteps(replay, setup)
  return [...menuSteps(setup), ...blocks, mark('end'), wait(LAST_SCENE_FRAMES), mark('last-scene')]
}

/** What the direct entry is built from: the entry's numbers, the routine's build, the Pokémon
 * format, the battle's checks, the pokebw2 commit of the numbers and the gauge's numbers. */
interface EntryInput {
  entry: EntryNumbers
  routine: RoutineBuild
  format: PkmFormat
  checks: readonly RamCheck[]
  pin: string
  gauge: GaugeNumbers
}

/** The direct entry from power-on to the action menu with the replay's parties sealed and its
 * trainer names, and the near box's HP numbers hidden (a replay is a single), once the replay is
 * checked; its notes start with the names cut in a Pokémon. */
export function replayEntry(replay: Gen5Replay, input: EntryInput): DirectEntry {
  checkReplay(replay, input.pin)
  const { parties, notes } = sealParties(replay.parties, input.format)
  const hpNumbers = input.gauge
  const sides = { names: replay.trainers, parties, style: 'single', hpNumbers } as const
  const direct = directEntry(input.entry, input.routine, sides, input.checks)
  return { ...direct, notes: [...notes, ...direct.notes] }
}
