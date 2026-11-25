import { describe, expect, it } from 'vitest'

import { frontMon, findServers, singleBattlePos } from './battle-mons'
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
  party: { size: 0x20, align: 4, fields: { mons: { offset: 0x04, size: 0x18 } } },
  monCore: {
    size: 0x1f,
    align: 4,
    upTo: 'monId',
    fields: {
      species: { offset: 0x02, size: 2 },
      hp: { offset: 0x04, size: 2 },
      maxHP: { offset: 0x06, size: 2 },
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
  for (const [mon, species, hp, maxHp, level, monId] of [
    [NEAR, 25, 33, 40, 17, 4],
    [FAR, 133, 30, 30, 18, 9],
  ] as const) {
    put(mon + 0x02, species, 2)
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
