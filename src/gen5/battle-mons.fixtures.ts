// The invented numbers of the battle's readers (src/gen5/battle-mons.ts): pokebw2's names with
// layouts, offsets and clients of their own. scripts/gen5-fixtures-real.test.ts holds that no
// number here equals the generated one under the same name.
import type { BattleNumbers, SingleBattle } from './bw2-numbers.ts'

/** Invented layouts: the members the page follows, at offsets and in orders of their own, and a
 * single battle of three clients. */
export const BATTLE: BattleNumbers = {
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
      parties: { offset: 0x0c, size: 0x80 },
      'parties.mons': { offset: 0x10, size: 0x18 },
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
  single: { clientCount: 3, posClientIds: [2, 0, 1], clients: { player: 2, opponent: 0 } },
  constants: {},
  monIds: { firstByClient: [9, 21, 33], perClient: 7 },
}

/** An invented single battle of three clients, the first two swapped. */
export const SWAPPED_SINGLE: SingleBattle = {
  clientCount: 3,
  posClientIds: [1, 0, 2],
  clients: { player: 1, opponent: 0 },
}

/** The same with client 2 at two positions, so client 0 stands at none. */
export const ONE_CLIENT_TWICE: SingleBattle = { ...SWAPPED_SINGLE, posClientIds: [2, 2, 1] }
