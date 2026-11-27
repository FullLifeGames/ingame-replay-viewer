// The steps that hand a Gen 5 replay's blocks to the player's client (#107, lane plan D4): each
// block goes into the adapter once the client answered the one before, with no button press
// between. The plan refuses a replay of another format version or built on another pokebw2 pin
// than the numbers it writes with. The moment script (scripts/gen5-moment-plan.ts) writes its
// blocks through the same steps, and the page plays them frame by frame. Pure: no Node, no DOM.
import { type AdapterNumbers, adapterWrites } from './adapter.ts'
import { GEN5_REPLAY_VERSION, type Gen5Replay } from './backend/replay.ts'
import type { ServerCmdTable } from './bw2-numbers.ts'
import type { MacroStep } from './macro.ts'
import type { RamCheck } from './ram-check.ts'
import { packCommands, type ServerCommand } from './server-cmd.ts'

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
}

/** The check that the client answered its last command: `returned` reads 1 at the adapter. */
export function answered(setup: BlockSetup): RamCheck {
  const field = setup.adapterNumbers.layout.fields.returned
  if (field?.size !== 1) throw new Error("the adapter's returned must sit in one byte")
  const mask = (2 ** (field.bits ?? 8) - 1) * 2 ** (field.bit ?? 0)
  const address = setup.adapter + field.offset
  return { name: 'returned', address, width: 1, mask, oneOf: [2 ** (field.bit ?? 0)] }
}

/** The steps of one block: its write, the wait for the client's answer, and the mark
 * `<name>-answered`. */
export function blockSteps(
  setup: BlockSetup,
  name: string,
  commands: readonly ServerCommand[],
): MacroStep[] {
  const block = packCommands(setup.table, commands)
  return [
    { kind: 'write', name, writes: adapterWrites(setup.adapterNumbers, setup.adapter, block) },
    {
      kind: 'until',
      name,
      checks: [answered(setup)],
      holdFor: 1,
      limit: BLOCK_LIMIT,
      markEvery: BLOCK_FRAMES_EVERY,
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
  return replay.blocks.flatMap(({ name, commands }) => blockSteps(setup, name, commands))
}
