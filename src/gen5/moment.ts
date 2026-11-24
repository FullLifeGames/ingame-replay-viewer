// One battle moment of the Gen 5 spike (#72) as server commands: a Pokémon uses a move on
// another, the target's HP goes to a given value, and a standard line may follow. The page packs
// the commands (server-cmd.ts) into one block for the player's client (adapter.ts). The command
// names are pokebw2's; their numbers and formats come from build/gen5/bw2.json. The arguments
// follow the client's handlers in pokebw2's src/battle/btl_client.c (BattleClient_ScMoveMsg,
// _ScMoveAnim, _ScOpSubtractHp, _ScOpAddHp, _ScUpdateHpGauge, _ScMsgStd).
import type { ServerCommand } from './server-cmd.ts'

/** A Pokémon in the battle: its mon ID (the client's copy) and its battle position. */
interface MomentMon {
  monId: number
  pos: number
}

export interface Moment {
  attacker: MomentMon
  target: MomentMon & { hp: number; maxHp: number }
  /** The move's number, which in Gen 5 is its number in @pkmn/dex. */
  move: number
  /** The target's HP once the bar has moved. */
  hpAfter: number
  /** A message ID of the standard bank, shown after the bar. */
  stdMessage?: number
}

/** The effect index of SC_MOVE_ANIM for a move's only turn, as the server sends it for a plain
 * move (pokebw2 src/battle/btl_server_flow.c, the SC_MOVE_ANIM puts with a last argument 0). */
const PLAIN_TURN = 0

function checkHp(moment: Moment): void {
  const { hp, maxHp } = moment.target
  const after = moment.hpAfter
  if (!Number.isInteger(hp) || hp < 0 || hp > maxHp) {
    throw new RangeError(`The target's HP ${String(hp)} lies outside 0 to ${String(maxHp)}.`)
  }
  if (!Number.isInteger(after) || after < 0 || after > maxHp) {
    throw new RangeError(`The HP ${String(after)} lies outside 0 to ${String(maxHp)}.`)
  }
}

/** The commands that move the target's HP to `hpAfter` and its bar with it; none if it stays. */
function hpCommands(moment: Moment): ServerCommand[] {
  const { monId, hp } = moment.target
  const after = moment.hpAfter
  if (after === hp) return []
  const change =
    after < hp
      ? { command: 'SC_OP_SUBTRACT_HP', args: [monId, hp - after] }
      : { command: 'SC_OP_ADD_HP', args: [monId, after - hp] }
  return [change, { command: 'SC_UPDATE_HP_GAUGE', args: [monId] }]
}

/** The commands of one moment, in the order the client plays them. */
export function momentCommands(moment: Moment): ServerCommand[] {
  checkHp(moment)
  const { attacker, target, move } = moment
  const line: ServerCommand[] =
    moment.stdMessage === undefined
      ? []
      : [{ command: 'SC_MSG_STD', message: moment.stdMessage, args: [] }]
  return [
    { command: 'SC_MOVE_MSG', args: [attacker.monId, move] },
    { command: 'SC_MOVE_ANIM', args: [attacker.pos, target.pos, move, PLAIN_TURN] },
    ...hpCommands(moment),
    ...line,
  ]
}
