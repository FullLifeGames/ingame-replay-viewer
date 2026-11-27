// The steps that play a Gen 5 replay (#107, #110): the direct entry from power-on with the
// replay's parties and trainer names, then the hold of the server, the player's answer to the
// first action menu, and each block once the client answered the one before, with no button press
// between. After the last block nothing is written and the game holds the last scene. Both plans
// refuse a replay of another format version or built on another pokebw2 pin than the numbers they
// write with, before any step. The moment script (scripts/gen5-moment-plan.ts) and its hand scenes
// (scripts/gen5-moment-blocks.ts) write through the same steps, and the page plays them frame by
// frame. Pure: no Node, no DOM.
import { type AdapterNumbers, adapterWrites, holdWrites } from './adapter.ts'
import { sealParties } from './backend/party-mon.ts'
import { type Gen5Block, GEN5_REPLAY_VERSION, type Gen5Replay } from './backend/replay.ts'
import type { EntryNumbers, ServerCmdTable } from './bw2-numbers.ts'
import { type DirectEntry, directEntry } from './direct-entry.ts'
import { mark, type MacroStep, wait } from './macro.ts'
import type { PkmFormat } from './pkm-members.ts'
import type { RamCheck } from './ram-check.ts'
import type { RoutineBuild } from './routine-order.ts'
import { packCommands } from './server-cmd.ts'

/** Frames the player's answer to the menu may take; A every MASH_EVERY frames for 3. */
const MENU_LIMIT = 1800
const MASH_EVERY = 30
/** Frames the game holds the last scene after the last block's answer. */
const LAST_SCENE_FRAMES = 300

/** Frames a block may take, and a frame of it every BLOCK_FRAMES_EVERY frames. */
const BLOCK_LIMIT = 3000
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

/** A block to write: its name, the log lines it shows (none for a moment's block) and its
 * commands. */
type PlanBlock = Pick<Gen5Block, 'name' | 'commands'> & { readonly lines?: readonly number[] }

/** The writes of one block; a block past the adapter's room fails by its name and lines, with the
 * adapter's error as the cause. */
function namedWrites(setup: BlockSetup, { name, lines, commands }: PlanBlock) {
  const block = packCommands(setup.table, commands)
  try {
    return adapterWrites(setup.adapterNumbers, setup.adapter, block)
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    const label = lines === undefined ? name : `${name} (lines ${lines.join(', ')})`
    throw new RangeError(`${label}: ${error.message}`, { cause: error })
  }
}

/** The steps of one block: its write, the wait for the client's answer, and the mark
 * `<name>-answered`. */
export function blockSteps(
  setup: BlockSetup & Pick<ReplaySetup, 'markEvery'>,
  block: PlanBlock,
): MacroStep[] {
  const { name } = block
  return [
    { kind: 'write', name, writes: namedWrites(setup, block) },
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
  return replay.blocks.flatMap((block) => blockSteps(setup, block))
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
 * format, the battle's checks and the pokebw2 commit of the numbers. */
interface EntryInput {
  entry: EntryNumbers
  routine: RoutineBuild
  format: PkmFormat
  checks: readonly RamCheck[]
  pin: string
}

/** The direct entry from power-on to the action menu with the replay's parties sealed and its
 * trainer names, once the replay is checked; its notes start with the names cut in a Pokémon. */
export function replayEntry(replay: Gen5Replay, input: EntryInput): DirectEntry {
  checkReplay(replay, input.pin)
  const { parties, notes } = sealParties(replay.parties, input.format)
  const sides = { names: replay.trainers, parties, style: 'single' } as const
  const direct = directEntry(input.entry, input.routine, sides, input.checks)
  return { ...direct, notes: [...notes, ...direct.notes] }
}
