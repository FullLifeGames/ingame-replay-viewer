// The battle structs of the pinned pokebw2 checkout that lead from the server to the Pokémon
// (#72): laid out by gen5-bw2-struct.ts, the long ones only up to the member the spike reads,
// whose offset does not depend on the members after it. Also the single battle's clients and the
// client at each position, from its setup (#77). Part of build/gen5/bw2.json.
import type { BattleNumbers, SingleBattle } from '../src/gen5/bw2-numbers.ts'
import { bodyOf, enumAround, literal, stripComments } from './gen5-bw2-c.ts'
import { firstMember, structLayout } from './gen5-bw2-struct.ts'

/** The sources read: btl_server.c and .h, btl_main.c and .h, and btl_pokeparam.h. */
export interface BattleSources {
  serverC: string
  serverH: string
  mainC: string
  mainH: string
  pokeparamH: string
}

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

/** The client count and the client at each position that the single battle's setup assigns. */
function singleBattle(mainC: string): SingleBattle {
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
  return { clientCount, posClientIds }
}

export function battleNumbers(sources: BattleSources): BattleNumbers {
  const { serverC, serverH, mainC, mainH, pokeparamH } = sources
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
    single: singleBattle(mainC),
  }
}
