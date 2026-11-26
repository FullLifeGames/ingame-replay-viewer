import { describe, expect, it } from 'vitest'

import { frontMon, findServers, partyMons, singleBattlePos } from './battle-mons'
import type { BattleNumbers } from './bw2-numbers'
import type { ReadRam } from './ram-check'

// Invented layouts and addresses: the members the page follows, at offsets and in orders of their
// own, a step function at an address no game uses, and an invented single battle of three clients.
const BATTLE: BattleNumbers = {
  server: {
    size: 0x20,
    align: 4,
    upTo: 'pokeCon',
    fields: {
      seq: { offset: 0x08, size: 4 },
      proc: { offset: 0x0c, size: 4 },
      mainModule: { offset: 0x18, size: 4 },
      pokeCon: { offset: 0x1c, size: 4 },
    },
  },
  mainModule: {
    size: 0x14,
    align: 4,
    upTo: 'server',
    fields: { server: { offset: 0x10, size: 4 } },
  },
  pokeCon: {
    size: 0x90,
    align: 4,
    fields: {
      forServer: { offset: 0x00, size: 4 },
      parties: { offset: 0x04, size: 0x80 },
      'parties.mons': { offset: 0x08, size: 0x18 },
      mainModule: { offset: 0x8c, size: 4 },
    },
  },
  party: {
    size: 0x20,
    align: 4,
    fields: { count: { offset: 0x00, size: 1 }, mons: { offset: 0x04, size: 0x18 } },
  },
  monCore: {
    size: 0x1f,
    align: 4,
    upTo: 'monId',
    fields: {
      species: { offset: 0x02, size: 2 },
      hp: { offset: 0x04, size: 2 },
      maxHP: { offset: 0x06, size: 2 },
      heldItem: { offset: 0x0a, size: 2 },
      baseAbility: { offset: 0x0e, size: 2 },
      level: { offset: 0x1c, size: 1 },
      monId: { offset: 0x1e, size: 1 },
    },
  },
  waitSelectSeq: 7,
  single: { clientCount: 3, posClientIds: [2, 0, 1] },
}
const BASE = 0x02000000
const PROC = 0x021357a0
const SERVER = 0x02000100
const MODULE = 0x02000400
const CLIENT_CON = 0x02000420
const SERVER_CON = CLIENT_CON + 0x90
const NEAR = 0x02000800
const FAR = 0x02000a00
const SECOND = 0x02000c00
const THIRD = 0x02000e00

function memory() {
  const bytes = new Uint8Array(0x2000)
  const view = new DataView(bytes.buffer)
  const put = (address: number, value: number, width: 1 | 2 | 4) => {
    const at = address - BASE
    if (width === 1) view.setUint8(at, value)
    else if (width === 2) view.setUint16(at, value, true)
    else view.setUint32(at, value, true)
  }
  put(SERVER + 0x0c, PROC + 1, 4)
  put(SERVER + 0x08, 7, 4)
  put(SERVER + 0x18, MODULE, 4)
  put(SERVER + 0x1c, SERVER_CON, 4)
  put(MODULE + 0x10, SERVER, 4)
  put(CLIENT_CON + 0x8c, MODULE, 4)
  put(SERVER_CON + 0x8c, MODULE, 4)
  put(SERVER_CON, 1, 4)
  put(CLIENT_CON + 0x04 + 0x04, NEAR, 4)
  put(CLIENT_CON + 0x04 + 0x20 + 0x04, FAR, 4)
  put(CLIENT_CON + 0x04, 3, 1)
  put(CLIENT_CON + 0x04 + 0x04 + 4, SECOND, 4)
  put(CLIENT_CON + 0x04 + 0x04 + 8, THIRD, 4)
  put(CLIENT_CON + 0x04 + 0x20, 1, 1)
  for (const [mon, species, hp, maxHp, level, monId, item, ability] of [
    [NEAR, 25, 33, 40, 17, 4, 210, 9],
    [FAR, 133, 30, 30, 18, 9, 0, 50],
    [SECOND, 7, 41, 41, 20, 5, 13, 44],
    [THIRD, 52, 0, 35, 19, 6, 88, 101],
  ] as const) {
    put(mon + 0x02, species, 2)
    put(mon + 0x0a, item, 2)
    put(mon + 0x0e, ability, 2)
    put(mon + 0x04, hp, 2)
    put(mon + 0x06, maxHp, 2)
    put(mon + 0x1c, level, 1)
    put(mon + 0x1e, monId, 1)
  }
  // Decoys: the proc word with another step, and one without the Thumb bit and no main module.
  put(0x0200020c, PROC + 1, 4)
  put(0x02000208, 5, 4)
  put(0x0200030c, PROC, 4)
  put(0x02000308, 7, 4)
  const read: ReadRam = (address, width) => {
    const at = address - BASE
    if (width === 1) return view.getUint8(at)
    return width === 2 ? view.getUint16(at, true) : view.getUint32(at, true)
  }
  return { bytes, read, put }
}

// Scene: the server and the Pokémon live on the game's heap, so the page finds the server by its
// step function and follows pointers from there, checking each link.
describe('findServers', () => {
  it('finds each word that holds the step function, Thumb bit or not, beside the waiting step', () => {
    expect(findServers(memory().bytes, BASE, PROC, BATTLE)).toEqual([SERVER, 0x02000300])
  })
})

describe('frontMon', () => {
  it("reads the client's front Pokémon from the clients' poke container", () => {
    const { read } = memory()
    expect(frontMon(read, SERVER, BATTLE, 1)).toEqual({
      address: FAR,
      monId: 9,
      species: 133,
      hp: 30,
      maxHp: 30,
      level: 18,
    })
    expect(frontMon(read, SERVER, BATTLE, 0)).toMatchObject({ monId: 4, species: 25, hp: 33 })
  })

  it('refuses a server whose main module does not point back to it', () => {
    expect(() => frontMon(memory().read, 0x02000300, BATTLE, 0)).toThrow(/point back/)
  })

  it("refuses a container that is the server's own, or of another main module", () => {
    const own = memory()
    own.put(CLIENT_CON, 1, 4)
    expect(() => frontMon(own.read, SERVER, BATTLE, 0)).toThrow(/server's/)
    const other = memory()
    other.put(CLIENT_CON + 0x8c, 0x02000500, 4)
    expect(() => frontMon(other.read, SERVER, BATTLE, 0)).toThrow(/main module/)
  })
})

// Scene: the readings of a run without a save hold each side's whole party as the battle copied
// it, to compare with the party the park wrote.
describe('partyMons', () => {
  it("reads every Pokémon of the client's party in the clients' container, in party order", () => {
    const { read } = memory()
    const one = (species: number, level: number, hp: number, maxHp: number) => ({
      species,
      level,
      hp,
      maxHp,
    })
    expect(partyMons(read, SERVER, BATTLE, 0)).toEqual([
      { ...one(25, 17, 33, 40), address: NEAR, monId: 4, item: 210, ability: 9 },
      { ...one(7, 20, 41, 41), address: SECOND, monId: 5, item: 13, ability: 44 },
      { ...one(52, 19, 0, 35), address: THIRD, monId: 6, item: 88, ability: 101 },
    ])
    expect(partyMons(read, SERVER, BATTLE, 1).map((mon) => mon.species)).toEqual([133])
  })

  it('refuses a count above the slots, and a Pokémon outside main RAM', () => {
    const many = memory()
    many.put(CLIENT_CON + 0x04, 7, 1)
    expect(() => partyMons(many.read, SERVER, BATTLE, 0)).toThrow(
      "client 0's party counts more Pokémon than its slots",
    )
    const outside = memory()
    outside.put(CLIENT_CON + 0x04 + 0x04 + 8, 0x0100, 4)
    expect(() => partyMons(outside.read, SERVER, BATTLE, 0)).toThrow(
      /Pokémon 2 at 0x100 lies outside/,
    )
  })
})

// Scene: the moment's positions follow the single battle's setup, not the client ID. Both setups
// are invented: in the three clients' one, client 0 stands at position 1, client 1 at 2 and
// client 2 at 0; the other holds two clients in swapped order.
describe('singleBattlePos', () => {
  const swapped = { clientCount: 2, posClientIds: [1, 0] }

  it("puts each client's Pokémon at the position its setup gives it", () => {
    expect([0, 1, 2].map((client) => singleBattlePos(BATTLE.single, client))).toEqual([1, 2, 0])
    expect([0, 1].map((client) => singleBattlePos(swapped, client))).toEqual([1, 0])
  })

  it('refuses a client outside the count', () => {
    expect(() => singleBattlePos(swapped, 2)).toThrow(/client 2/)
    expect(() => singleBattlePos(swapped, -1)).toThrow(/client -1/)
    expect(() => singleBattlePos(swapped, 0.5)).toThrow(/client 0.5/)
    expect(() => singleBattlePos({ clientCount: 2, posClientIds: [1, 1] }, 0)).toThrow(/client 0/)
  })
})
