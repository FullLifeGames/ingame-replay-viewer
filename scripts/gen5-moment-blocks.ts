// The blocks of the moment script's hand scenes (#107, #108): the plan that hands a
// Gen 5 replay's blocks to the player's client, and the log lines that show what each block sends.
// The plan is a whole replay's (src/gen5/replay-plan.ts, #110): it holds the server and lets the
// player answer the action menu as the moment does (D8 of the cut), writes each block once the
// client answered the one before, and holds the last scene; it refuses a replay of another
// version or another pokebw2 pin. The log names each block, its lines and its commands, with the
// text of each line it shows from the checkout's text banks.
import { adapterNumbers } from '../src/gen5/adapter.ts'
import { nameOfNumber } from '../src/gen5/backend/names.ts'
import type { Gen5Replay } from '../src/gen5/backend/replay.ts'
import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import { replayPlan } from '../src/gen5/replay-plan.ts'
import type { ServerCommand } from '../src/gen5/server-cmd.ts'
import type { Battle } from './gen5-moment-read.ts'
import { moveLineLabel, type Side, type TEXT_BANKS, textId, textLine } from './gen5-moment-scene.ts'

/** What the log reads a block's lines from: the text banks and each mon ID's side. */
interface BlockText {
  readonly banks: Record<keyof typeof TEXT_BANKS, string>
  readonly sideOf: (monId: number) => Side
}

/** The text a command shows: a move's line by its label, a message's line by its ID. A move with
 * no label in the move bank is named as such: the log never stops a run. */
function shownText(command: ServerCommand, text: BlockText): string {
  const { banks } = text
  if (command.message !== undefined) {
    const bank = command.command === 'SC_MSG_SET' ? banks.set : banks.standard
    return `; message ${String(command.message)}: ${textLine(bank, command.message)}`
  }
  if (command.command !== 'SC_MOVE_MSG') return ''
  const [monId = -1, move = -1] = command.args
  const name = nameOfNumber('move', move)
  if (name === undefined) throw new Error(`@pkmn/dex knows no Gen 5 move ${String(move)}`)
  const label = moveLineLabel(name, text.sideOf(monId), banks.move)
  if (label === undefined) return `; no line label for ${name}`
  return `; ${label}: ${textLine(banks.move, textId(banks.move, label))}`
}

/** One line per block (its name, lines and command count) and one per command, with its
 * arguments, its trailing bytes and the text it shows. */
export function blockLines(replay: Pick<Gen5Replay, 'blocks'>, text: BlockText): string[] {
  return replay.blocks.flatMap(({ name, lines, commands }) => {
    const count = `${String(commands.length)} command${commands.length === 1 ? '' : 's'}`
    const head = `${name}: lines ${lines.join(', ')}; ${count}`
    return [
      head,
      ...commands.map((command) => {
        const args = command.args.length > 0 ? ` ${command.args.join(', ')}` : ''
        const bytes = command.bytes === undefined ? '' : `; bytes ${command.bytes.join(', ')}`
        return `${name} ${command.command}${args}${bytes}${shownText(command, text)}`
      }),
    ]
  })
}

/** The side of a mon ID: the side whose party, read at the action menu, holds it. A mon ID stays
 * with its Pokémon through every send-in, so this holds after switches too. */
export function sideOfMon(
  parties: Record<Side, { readonly mons: readonly { readonly monId: number }[] }>,
): (monId: number) => Side {
  return (monId) => {
    const holds = (side: Side) => parties[side].mons.some((mon) => mon.monId === monId)
    if (holds('near')) return 'near'
    if (holds('far')) return 'far'
    throw new Error(`no party read at the action menu holds mon ID ${String(monId)}`)
  }
}

/** What a hand scene reads: the numbers, the battle read from RAM and the text banks. */
interface SceneInput {
  readonly numbers: Bw2Numbers
  readonly battle: Pick<Battle, 'adapter' | 'parties'>
  readonly banks: BlockText['banks']
}

/** A hand scene on the battle read: its steps, and its block lines for the log. */
export function blocksScene(replay: Gen5Replay | undefined, input: SceneInput) {
  if (replay === undefined) throw new Error("a hand scene needs the replay's blocks")
  const { numbers, battle, banks } = input
  const sideOf = sideOfMon(battle.parties)
  const setup = { adapterNumbers: adapterNumbers(numbers), table: numbers, adapter: battle.adapter }
  const steps = replayPlan(replay, { ...setup, pin: numbers.pokebw2.commit })
  return { steps, lines: blockLines(replay, { banks, sideOf }) }
}
