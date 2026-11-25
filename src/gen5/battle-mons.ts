// Finds the battle server and the Pokémon in DS main RAM for the Gen 5 spike (#72). Both live on
// the game's heap, so their addresses change from battle to battle. The server is found by its
// step function, and from it a chain of pointers leads to the clients' poke container
// (pokebw2: src/battle/btl_server.c, src/battle/btl_main.c, include/battle/btl_main.h). Each link
// is checked before it is followed. The layouts come from build/gen5/bw2.json.
import type { BattleNumbers, SingleBattle, StructLayout } from './bw2-numbers.ts'
import { inMainRam } from './main-ram.ts'
import type { ReadRam } from './ram-check.ts'

/** A Pokémon of the clients' poke container, as the client sees it. */
export interface BattleMonReading {
  address: number
  monId: number
  species: number
  hp: number
  maxHp: number
  level: number
}

const hex = (value: number) => `0x${value.toString(16)}`

function offsetOf(layout: StructLayout, field: string, what: string): number {
  const found = layout.fields[field]
  if (found === undefined) throw new Error(`the layout of ${what} has no field ${field}`)
  return found.offset
}

/** The DS addresses where a server's step is `proc` (a Thumb function, so the word may carry
 * bit 0) and its seq the wait for the actions. `ram` is main RAM from `base`. */
export function findServers(
  ram: Uint8Array,
  base: number,
  proc: number,
  battle: BattleNumbers,
): number[] {
  const procAt = offsetOf(battle.server, 'proc', 'BtlServer')
  const seqAt = offsetOf(battle.server, 'seq', 'BtlServer')
  const view = new DataView(ram.buffer, ram.byteOffset, ram.byteLength)
  const found: number[] = []
  const last = ram.byteLength - Math.max(procAt, seqAt) - 4
  for (let at = 0; at <= last; at += 4) {
    const word = view.getUint32(at + procAt, true)
    if ((word | 1) !== (proc | 1)) continue
    if (view.getUint32(at + seqAt, true) === battle.waitSelectSeq) found.push(base + at)
  }
  return found
}

/** The clients' poke container, the one before the server's in the main module, checked. */
function clientCon(read: ReadRam, server: number, battle: BattleNumbers): number {
  const field = (layout: StructLayout, name: string, what: string, at: number) =>
    read(at + offsetOf(layout, name, what), 4)
  const mainModule = field(battle.server, 'mainModule', 'BtlServer', server)
  const back = inMainRam(mainModule)
    ? field(battle.mainModule, 'server', 'BtlMainModule', mainModule)
    : undefined
  if (back !== server) {
    throw new Error(`the main module at ${hex(mainModule)} does not point back to ${hex(server)}`)
  }
  const serverCon = field(battle.server, 'pokeCon', 'BtlServer', server)
  const con = serverCon - battle.pokeCon.size
  if (field(battle.pokeCon, 'mainModule', 'BtlPokeCon', con) !== mainModule) {
    throw new Error(`the container at ${hex(con)} belongs to another main module`)
  }
  if (field(battle.pokeCon, 'forServer', 'BtlPokeCon', con) !== 0) {
    throw new Error(`the container at ${hex(con)} is the server's, not the clients'`)
  }
  return con
}

/** The front Pokémon of `clientId`'s party in the clients' container, reached from the server. */
export function frontMon(
  read: ReadRam,
  server: number,
  battle: BattleNumbers,
  clientId: number,
): BattleMonReading {
  const con = clientCon(read, server, battle)
  const party =
    con + offsetOf(battle.pokeCon, 'parties', 'BtlPokeCon') + clientId * battle.party.size
  const address = read(party + offsetOf(battle.party, 'mons', 'BattleParty'), 4)
  if (!inMainRam(address)) {
    throw new Error(
      `client ${String(clientId)}'s front Pokémon at ${hex(address)} lies outside main RAM`,
    )
  }
  const core = (name: string, width: 1 | 2) =>
    read(address + offsetOf(battle.monCore, name, 'BattleMonCore'), width)
  return {
    address,
    monId: core('monId', 1),
    species: core('species', 2),
    hp: core('hp', 2),
    maxHp: core('maxHP', 2),
    level: core('level', 1),
  }
}

/** A single battle's position of a client's Pokémon, from the battle's setup. */
export function singleBattlePos(single: SingleBattle, clientId: number): number {
  const pos = single.posClientIds.indexOf(clientId)
  if (!Number.isInteger(clientId) || clientId < 0 || clientId >= single.clientCount || pos < 0) {
    throw new RangeError(`A single battle has no client ${String(clientId)}.`)
  }
  return pos
}
