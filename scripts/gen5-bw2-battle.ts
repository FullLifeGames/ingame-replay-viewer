// The battle structs of the pinned pokebw2 checkout that lead from the server to the Pokémon
// (#72): laid out by gen5-bw2-struct.ts, the long ones only up to the member the spike reads,
// whose offset does not depend on the members after it. Part of build/gen5/bw2.json.
import type { BattleNumbers } from '../src/gen5/bw2-numbers.ts'
import { enumAround } from './gen5-bw2-c.ts'
import { firstMember, structLayout } from './gen5-bw2-struct.ts'

/** The sources read: btl_server.c and .h, btl_main.h and btl_pokeparam.h. */
export interface BattleSources {
  serverC: string
  serverH: string
  mainH: string
  pokeparamH: string
}

const WAIT_SELECT = 'BTL_SERVER_ACTION_SEQ_WAIT_SELECT'
const MON_CORE = 'BattleMonCore core'

export function battleNumbers(sources: BattleSources): BattleNumbers {
  const { serverC, serverH, mainH, pokeparamH } = sources
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
  }
}
