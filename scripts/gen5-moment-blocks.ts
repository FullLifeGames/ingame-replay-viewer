// The blocks of the moment script's hits scene (#107, lane plan step 107-5): the plan that hands a
// Gen 5 replay's blocks to the player's client, and the log lines that show what each block sends.
// The plan holds the server and lets the player answer the action menu as the moment does
// (gen5-moment-plan.ts, D8 of the cut, until #110 reads the server's start), then writes each
// block once the client answered the one before (src/gen5/replay-plan.ts), which refuses a
// replay of another version or another pokebw2 pin. The log names each block, its lines and its
// commands, with the text of each line it shows from the checkout's text banks.
import { adapterNumbers } from '../src/gen5/adapter.ts'
import { nameOfNumber } from '../src/gen5/backend/names.ts'
import type { Gen5Replay } from '../src/gen5/backend/replay.ts'
import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import type { MacroStep } from '../src/gen5/macro.ts'
import { type BlockSetup, replaySteps } from '../src/gen5/replay-plan.ts'
import type { ServerCommand } from '../src/gen5/server-cmd.ts'
import { menuSteps } from './gen5-moment-plan.ts'
import type { Battle } from './gen5-moment-read.ts'
import { moveLineLabel, type Side, type TEXT_BANKS, textId, textLine } from './gen5-moment-scene.ts'

/** The steps of the hits scene: the menu's answer, each block, then the mark `end`. */
export function blocksPlan(replay: Gen5Replay, setup: BlockSetup & { pin: string }): MacroStep[] {
  const blocks = replaySteps(replay, setup)
  return [...menuSteps(setup), ...blocks, { kind: 'mark', name: 'end' }]
}

/** What the log reads a block's lines from: the text banks and each mon ID's side. */
interface BlockText {
  readonly banks: Record<keyof typeof TEXT_BANKS, string>
  readonly sideOf: (monId: number) => Side
}

/** The text a command shows: a move's line by its label, a message's line by its ID. */
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
  const label = moveLineLabel(name, text.sideOf(monId))
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

/** What the hits scene reads: the numbers, the battle read from RAM and the text banks. */
interface HitsInput {
  readonly numbers: Bw2Numbers
  readonly battle: Pick<Battle, 'adapter' | 'near'>
  readonly banks: BlockText['banks']
}

/** The hits scene on the battle read: its steps, and its block lines for the log. */
export function hitsScene(replay: Gen5Replay | undefined, input: HitsInput) {
  if (replay === undefined) throw new Error("the hits scene needs the replay's blocks")
  const { numbers, battle, banks } = input
  const sideOf = (monId: number): Side => (monId === battle.near.monId ? 'near' : 'far')
  const setup = { adapterNumbers: adapterNumbers(numbers), table: numbers, adapter: battle.adapter }
  const steps = blocksPlan(replay, { ...setup, pin: numbers.pokebw2.commit })
  return { steps, lines: blockLines(replay, { banks, sideOf }) }
}
