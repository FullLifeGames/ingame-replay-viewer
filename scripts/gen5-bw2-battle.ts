// The battle structs of the pinned pokebw2 checkout that lead from the server to the Pokémon
// (#72): laid out by gen5-bw2-struct.ts, the long ones only up to the member the spike reads,
// whose offset does not depend on the members after it. Also the single battle's clients, the
// client at each position (#77) and the player's client and the opponent's (#93), from its setup;
// the battle's constants and the mon-ID rule (#106). Part of build/gen5/bw2.json.
import type { BattleNumbers, SingleBattle } from '../src/gen5/bw2-numbers.ts'
import { bodyOf, definesByPrefix, enumAround, literal, stripComments } from './gen5-bw2-c.ts'
import { singleClients } from './gen5-bw2-clients.ts'
import { monIdRule } from './gen5-bw2-mon-ids.ts'
import { firstMember, structLayout } from './gen5-bw2-struct.ts'

/** The sources read: btl_server.c and .h, btl_main.c and .h, btl_client.h, btl_pokeparam.h and
 * the battle's constants. */
export interface BattleSources {
  serverC: string
  serverH: string
  mainC: string
  mainH: string
  clientH: string
  pokeparamH: string
  battleH: string
}

/** The prefixes of the battle's constants the backend names: the weathers, a battle Pokémon's
 * conditions (the side's and the field's start otherwise) and its stats and stat stages. */
export const CONSTANT_PREFIXES = ['BTL_WEATHER_', 'CONDITION_', 'BATTLEMON_']

const WAIT_SELECT = 'BTL_SERVER_ACTION_SEQ_WAIT_SELECT'
const MON_CORE = 'BattleMonCore core'
const SINGLE_SETUP = 'BtlMain_SetupAloneSingle'

function value(text: string, what: string): number {
  const found = literal(text)
  if (found === undefined) throw new Error(`${SINGLE_SETUP} sets ${what} to "${text}", no number`)
  return found
}

const COUNT = /\bclientCount\s*=\s*([^;]+);/g
const POSITION = /\bposClientIds\[([^\]]+)\]\s*=\s*([^;]+);/g

/** The client at each position, by position; throws on a position the setup skips. */
function positions(body: string): number[] {
  const posClientIds: number[] = []
  for (const [, pos = '', client = ''] of body.matchAll(POSITION)) {
    posClientIds[value(pos, 'a position')] = value(client, 'posClientIds')
  }
  const skipped = [...posClientIds.keys()].filter((pos) => posClientIds[pos] === undefined)
  if (skipped.length > 0) throw new Error(`${SINGLE_SETUP} skips positions ${skipped.join(', ')}`)
  return posClientIds
}

/** The client count, the client at each position, and the player's client and the opponent's,
 * as the single battle's setup assigns them. */
function singleBattle(mainC: string, clientH: string): SingleBattle {
  const body = stripComments(bodyOf(mainC, `${SINGLE_SETUP}(`))
  const counts = [...body.matchAll(COUNT)].map((match) => match[1] ?? '')
  const [count] = counts
  if (counts.length !== 1 || count === undefined) {
    throw new Error(`${SINGLE_SETUP} sets clientCount ${String(counts.length)} times, not once`)
  }
  const clientCount = value(count, 'clientCount')
  const posClientIds = positions(body)
  for (let client = 0; client < clientCount; client += 1) {
    const at = posClientIds.filter((id) => id === client).length
    if (at !== 1) {
      throw new Error(`${SINGLE_SETUP} puts client ${String(client)} at ${String(at)} positions`)
    }
  }
  const clients = singleClients(mainC, clientH)
  if ([clients.player, clients.opponent].some((client) => client >= clientCount)) {
    throw new Error(
      `${SINGLE_SETUP} creates the player's or the opponent's client outside the count`,
    )
  }
  return { clientCount, posClientIds, clients }
}

export function battleNumbers(sources: BattleSources): BattleNumbers {
  const { serverC, serverH, mainC, mainH, clientH, pokeparamH, battleH } = sources
  const first = firstMember(pokeparamH, 'BattleMon')
  if (first !== MON_CORE) throw new Error(`BattleMon starts with "${first}", not ${MON_CORE}`)
  const waitSelectSeq = enumAround(serverC, WAIT_SELECT)[WAIT_SELECT]
  if (waitSelectSeq === undefined) throw new Error(`no value for ${WAIT_SELECT}`)
  return {
    server: structLayout(serverH, 'BtlServer', 'pokeCon'),
    mainModule: structLayout(mainH, 'BtlMainModule', 'server'),
    pokeCon: structLayout(mainH, 'BtlPokeCon'),
    party: structLayout(mainH, 'BattleParty'),
    monCore: structLayout(pokeparamH, 'BattleMonCore', 'monId'),
    waitSelectSeq,
    single: singleBattle(mainC, clientH),
    monIds: monIdRule(mainC),
    constants: Object.fromEntries(
      CONSTANT_PREFIXES.flatMap((prefix) => Object.entries(definesByPrefix(battleH, prefix))),
    ),
  }
}
