// The moment script's readings of the battle at its action menu (#72, #78, #97): from main RAM
// once, the player's adapter, the one server waiting for the actions, both front Pokémon and each
// side's whole party as the battle copied it, each Pokémon by its species, item and ability name.
// It checks that each front Pokémon holds its client's slot 0 by mon ID. With the direct entry's
// team the log says whether each party reads as the park wrote it, and names what differs. The layouts and symbols come from
// build/gen5/bw2.json; scripts/gen5-moment.ts reads main RAM through the page and logs the rest.
import {
  type BattleMonReading,
  findServers,
  frontMon,
  type PartyMonReading,
  partyMons,
} from '../src/gen5/battle-mons.ts'
import { nameOfNumber } from '../src/gen5/backend/names.ts'
import type { WrittenSides } from '../src/gen5/backend/party-mon.ts'
import { monIdOf } from '../src/gen5/backend/slots.ts'
import type { Bw2Numbers, MonIds } from '../src/gen5/bw2-numbers.ts'
import { MAIN_RAM_START } from '../src/gen5/main-ram.ts'
import type { WrittenPkm } from '../src/gen5/pkm-fields.ts'
import { sideClient } from './gen5-moment-scene.ts'
import { log } from './gen5-page.ts'

export interface Battle {
  adapter: number
  server: number
  near: BattleMonReading
  far: BattleMonReading
}

type Side = 'near' | 'far'

const hex = (value: number) => `0x${value.toString(16)}`

/** The values a party's reading and its written Pokémon share. */
const COMPARED = ['species', 'level', 'hp', 'maxHp', 'item', 'ability'] as const

function symbol(numbers: Bw2Numbers, name: string): number {
  const found = numbers.symbols[name]
  if (!found) throw new Error(`bw2.json names no ${name}`)
  return found.address
}

/** What differs at `slot` between the reading and the Pokémon written, or nothing. */
function slotDiffers(
  read: PartyMonReading | undefined,
  written: WrittenPkm | undefined,
  slot: number,
) {
  const at = `pkms[${String(slot)}]`
  if (read === undefined) return `${at} is not in the battle`
  if (written === undefined) return `${at} was not written`
  const differs = COMPARED.filter((key) => read[key] !== written[key])
  return differs.length > 0 ? `${at} differs in ${differs.join(', ')}` : undefined
}

/** The readings' line of a side's party: how many of the Pokémon written it holds as written,
 * then each slot that differs. With nothing written (the walk) it counts the party read. */
export function partyLine(
  side: Side,
  read: readonly PartyMonReading[],
  written: readonly WrittenPkm[] | undefined,
): string {
  const head = `${side} party:`
  if (written === undefined) return `${head} ${String(read.length)} read`
  const slots = Array.from({ length: Math.max(read.length, written.length) }, (_, i) =>
    slotDiffers(read[i], written[i], i),
  )
  const same = slots.filter((slot, i) => slot === undefined && i < written.length).length
  const differs = slots.filter((slot) => slot !== undefined)
  return [`${head} ${String(same)} of ${String(written.length)} as written`, ...differs].join('; ')
}

/** The line of a front Pokémon's mon ID against the one `monIdOf` gives its client's slot 0. */
export function frontIdLine(side: Side, monId: number, monIds: MonIds, client: number): string {
  const lead = monIdOf(monIds, client, 0)
  const head = `${side} front: mon ID ${String(monId)}`
  return monId === lead
    ? `${head}, as monIdOf gives slot 0`
    : `${head}, but monIdOf gives ${String(lead)} for slot 0`
}

const speciesName = (num: number) => nameOfNumber('species', num) ?? '?'

function logParty(side: Side, party: readonly PartyMonReading[], noItem: number | undefined) {
  party.forEach((mon, i) => {
    const { level, hp, maxHp } = mon
    const item = mon.item === noItem ? 'no item' : (nameOfNumber('item', mon.item) ?? '?')
    const ability = nameOfNumber('ability', mon.ability) ?? '?'
    log(
      `${side} party pkms[${String(i)}]: ${speciesName(mon.species)} L${String(level)}, HP ${String(hp)}/${String(maxHp)}, ${item}, ${ability}`,
    )
  })
}

/** From main RAM (`ram` from MAIN_RAM_START): the adapter, the one server and both front
 * Pokémon, with both parties logged against `written`, the direct entry's team. */
export function readBattle(
  ram: Uint8Array,
  numbers: Bw2Numbers,
  written: WrittenSides | undefined,
): Battle {
  const view = new DataView(ram.buffer, ram.byteOffset, ram.byteLength)
  const read = (address: number, width: 1 | 2 | 4) => {
    const at = address - MAIN_RAM_START
    if (width === 1) return view.getUint8(at)
    return width === 2 ? view.getUint16(at, true) : view.getUint32(at, true)
  }
  const adapter = read(symbol(numbers, 'sAdapters'), 4)
  const proc = symbol(numbers, 'BattleServer_ProcSelectAction')
  const servers = findServers(ram, MAIN_RAM_START, proc, numbers.battle)
  log(`servers waiting for the actions: ${servers.map(hex).join(' ') || 'none'}`)
  const [server] = servers
  if (servers.length !== 1 || server === undefined) throw new Error('need exactly one server')
  const { single, monIds } = numbers.battle
  const near = frontMon(read, server, numbers.battle, sideClient(single, 'near'))
  const far = frontMon(read, server, numbers.battle, sideClient(single, 'far'))
  for (const [side, mon] of [
    ['near', near],
    ['far', far],
  ] as const) {
    log(
      `${side}: ${speciesName(mon.species)} L${String(mon.level)} mon ID ${String(mon.monId)}, HP ${String(mon.hp)}/${String(mon.maxHp)} at ${hex(mon.address)}`,
    )
    log(frontIdLine(side, mon.monId, monIds, sideClient(single, side)))
  }
  for (const [side, team] of [
    ['near', written?.player],
    ['far', written?.opponent],
  ] as const) {
    const party = partyMons(read, server, numbers.battle, sideClient(single, side))
    logParty(side, party, numbers.pkm.items.ITEM_NONE)
    log(partyLine(side, party, team))
  }
  return { adapter, server, near, far }
}
