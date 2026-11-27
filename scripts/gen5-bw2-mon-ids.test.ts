import { describe, expect, it } from 'vitest'

import { BATTLE_SOURCES } from './gen5-bw2-battle.fixtures'
import { checkPartyRoom, monIdRule } from './gen5-bw2-mon-ids'

// The reader's invented source is the battle fixtures' btl_main.c (gen5-bw2-battle.fixtures.ts).
const MAIN_C = BATTLE_SOURCES.mainC
const edited = (from: string, to: string) => MAIN_C.replace(from, to)

// Scene: the backend names a Pokémon in a server command by its mon ID, the client's first ID
// plus its party slot at the battle's start.
describe('monIdRule', () => {
  it("reads each client's first mon ID and the count of mon IDs a client holds", () => {
    expect(monIdRule(MAIN_C)).toEqual({ firstByClient: [14, 2, 26], perClient: 8 })
  })

  it('refuses a table whose size is a name or whose count differs from its size', () => {
    expect(() => monIdRule(edited('MonIds[3]', 'MonIds[CLIENTS]'))).toThrow(/sClientFirstMonIds/)
    expect(() => monIdRule(edited('sClientFirstMonIds[3] =', 'sFirsts[3] ='))).toThrow(
      /sClientFirstMonIds/,
    )
    expect(() => monIdRule(edited('{ 14, 2, 26 }', '{ 14, 2 }'))).toThrow(/sClientFirstMonIds/)
    expect(() => monIdRule(edited('{ 14, 2, 26 }', '{ 14, TWO, 26 }'))).toThrow(
      /sClientFirstMonIds/,
    )
  })

  it('refuses a search that uses the table without a span, or that walks another count', () => {
    expect(() => monIdRule(edited('high = low + 7;', 'high = low;'))).toThrow(/MonIDToClientID/)
    expect(() => monIdRule(edited('id <= high', 'id < high'))).toThrow(/MonIDToClientID/)
    expect(() => monIdRule(edited('k < 3;', 'k < 2;'))).toThrow(/MonIDToClientID/)
    expect(() => monIdRule(edited('ToClientID(u8 id)', 'ToClientID(u16 id)'))).toThrow(
      /MonIDToClientID/,
    )
  })

  it('refuses a GetClientIDFromMonID that is not the plain search of its argument', () => {
    const other = edited('return MonIDToClientID(id);', 'return MonIDToClientID(id) ^ 1;')
    expect(() => monIdRule(other)).toThrow(/GetClientIDFromMonID/)
  })

  it('refuses ranges of two clients that meet', () => {
    expect(() => monIdRule(edited('{ 14, 2, 26 }', '{ 14, 2, 20 }'))).toThrow(/overlap/)
  })
})

// Scene: a client's mon IDs must hold a whole party, or a sixth Pokémon would take another's ID.
describe('checkPartyRoom', () => {
  it('passes a count per client that holds a party and names one that does not', () => {
    const rule = { firstByClient: [14, 2, 26], perClient: 8 }
    expect(() => {
      checkPartyRoom(rule, 8)
    }).not.toThrow()
    expect(() => {
      checkPartyRoom(rule, 9)
    }).toThrow(/PARTY_SIZE/)
  })
})
