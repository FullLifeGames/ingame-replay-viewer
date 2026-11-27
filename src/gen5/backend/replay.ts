// A battle script as a Gen 5 replay (#106): what the page and the run take into Black 2. #106
// fills its trainers and parties; the blocks of server commands come with #107. Name cuts stay
// with the writes (`nameUnits`) and reach the log as notes (D9). Pure: every number of the game
// comes in from build/gen5/bw2.json.
import type { BattleScript } from '../../script/events.ts'
import type { DroppedLine, Side } from '../../script/types.ts'
import { HP_SCALE } from '../../gen3/translate/scale.ts'
import type { Bw2Numbers } from '../bw2-numbers.ts'
import type { ParkNames } from '../direct-park.ts'
import { pkmConstant } from '../pkm-cipher.ts'
import { pkmFormat } from '../pkm-members.ts'
import type { ServerCommand } from '../server-cmd.ts'
import { type Gen5Fallback, inLineOrder } from './fallbacks.ts'
import { fitName } from './font.ts'
import { trainerOt, type WrittenSides, writtenMon } from './party-mon.ts'
import { byParkSide, PARK_SIDES } from './slots.ts'
import { partyTeams } from './teams.ts'

/** The version of the replay's format; a reader refuses one it does not know. */
export const GEN5_REPLAY_VERSION = 1

/** The server commands of one stretch of the battle, with the log lines they show. */
interface Gen5Block {
  readonly name: string
  readonly lines: readonly number[]
  readonly commands: readonly ServerCommand[]
}

export interface Gen5Replay {
  readonly version: number
  /** The pokebw2 commit whose numbers the replay holds. */
  readonly pin: string
  readonly trainers: ParkNames
  /** Each side's Pokémon as written, in party order. */
  readonly parties: WrittenSides
  readonly blocks: readonly Gen5Block[]
  /** In line order. */
  readonly fallbacks: readonly Gen5Fallback[]
  readonly dropped: readonly DroppedLine[]
}

/** The numbers a replay is built from. */
export type ReplayNumbers = Pick<Bw2Numbers, 'pkm' | 'entry' | 'font' | 'pokebw2'>

/** The name of the player on `side`, fitted to the font. */
function trainerOf(script: BattleScript, side: Side, chars: string) {
  const player = script.events.find((event) => event.kind === 'player' && event.side === side)
  if (player?.kind !== 'player') throw new Error(`the log names no player on the ${side} side`)
  return fitName(player.name, chars, { line: player.line, what: `the ${side} trainer’s name` })
}

/** Throws by name when a side's party holds more Pokémon than the game's PARTY_SIZE. */
function checkPartySize(parties: Record<Side, readonly unknown[]>, numbers: ReplayNumbers) {
  const size = pkmConstant(numbers.pkm, 'PARTY_SIZE')
  for (const side of ['near', 'far'] as const) {
    const held = parties[side].length
    if (held > size) {
      const room = `the game’s PARTY_SIZE is ${String(size)}`
      throw new Error(`the ${side} side’s party holds ${String(held)} Pokémon; ${room}`)
    }
  }
}

/** The Gen 5 replay of a battle script: its trainers, both parties at HP_SCALE, and the
 * fallbacks. Throws by name on a species, move, item or ability Gen 5 lacks, and on a party
 * longer than the game's. */
export function buildGen5Replay(script: BattleScript, numbers: ReplayNumbers): Gen5Replay {
  const { chars } = numbers.font
  const format = pkmFormat(numbers)
  const teams = partyTeams(script, chars)
  checkPartySize(teams.parties, numbers)
  const names = { near: trainerOf(script, 'near', chars), far: trainerOf(script, 'far', chars) }
  const trainers: ParkNames = byParkSide((side) => names[side].text)
  const written = (side: Side) => {
    const ot = trainerOt(trainers[PARK_SIDES[side]])
    return teams.parties[side].map((mon, salt) =>
      writtenMon(mon, { ot, salt, format, hp: HP_SCALE }),
    )
  }
  return {
    version: GEN5_REPLAY_VERSION,
    pin: numbers.pokebw2.commit,
    trainers,
    parties: byParkSide(written),
    blocks: [],
    fallbacks: inLineOrder([...teams.fallbacks, ...names.near.fallbacks, ...names.far.fallbacks]),
    dropped: script.dropped,
  }
}
