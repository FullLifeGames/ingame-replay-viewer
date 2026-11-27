import { describe, expect, it } from 'vitest'

import { battleNumbers } from './gen5-bw2-battle'
import { BATTLE_SOURCES as SOURCES } from './gen5-bw2-battle.fixtures'

// The reader's invented sources are in gen5-bw2-battle.fixtures.ts.

// Scene: the page follows pointers from the server to the Pokémon at offsets from the structs.
describe('battleNumbers', () => {
  it('lays out the structs on the way, the cut ones up to the member the spike reads', () => {
    const battle = battleNumbers(SOURCES)
    expect(battle.server.fields.pokeCon).toEqual({ offset: 8, size: 4 })
    expect(battle.server.upTo).toBe('pokeCon')
    expect(battle.mainModule.fields.server).toEqual({ offset: 4, size: 4 })
    expect(battle.pokeCon.size).toBe(0x2c)
    expect(battle.pokeCon.fields.forServer).toEqual({ offset: 0, size: 4 })
    expect(battle.pokeCon.fields['parties.mons']).toEqual({ offset: 12, size: 12 })
    expect(battle.party.size).toBe(0x10)
    expect(battle.monCore.fields.monId).toEqual({ offset: 10, size: 1 })
    expect(battle.waitSelectSeq).toBe(5)
  })

  // Scene: a single battle's positions come from its setup, not from the client IDs.
  it("reads the single battle's clients and the client at each position as its setup writes them", () => {
    expect(battleNumbers(SOURCES).single).toEqual({
      clientCount: 3,
      posClientIds: [1, 2, 0],
      clients: { player: 1, opponent: 0 },
    })
  })

  it("refuses a player's or an opponent's client outside the count", () => {
    const mainC = SOURCES.mainC.replace('Create(mainModule, 6, 0)', 'Create(mainModule, 6, 3)')
    const outside = mainC.replace('clients[0] =', 'clients[3] =')
    expect(() => battleNumbers({ ...SOURCES, mainC: outside })).toThrow(/outside the count/)
  })

  it('refuses a setup without the function, without the count or without a position for a client', () => {
    const mainC = (from: string, to: string) => ({
      ...SOURCES,
      mainC: SOURCES.mainC.replace(from, to),
    })
    expect(() => battleNumbers(mainC('AloneSingle', 'AloneDouble'))).toThrow(
      /BtlMain_SetupAloneSingle/,
    )
    expect(() => battleNumbers(mainC('mainModule->clientCount = 3;', ''))).toThrow(/clientCount/)
    expect(() => battleNumbers(mainC('clientCount = 3', 'clientCount = 4'))).toThrow(/client 3/)
    expect(() => battleNumbers(mainC('posClientIds[2] = 0', 'posClientIds[2] = 1'))).toThrow(
      /client 0/,
    )
    expect(() => battleNumbers(mainC('posClientIds[1]', 'posClientIds[3]'))).toThrow(/skips/)
    expect(() => battleNumbers(mainC('clientCount = 3', 'clientCount = THREE'))).toThrow(/THREE/)
  })

  // Scene: the backend names the weather, the condition and the stat it writes by pokebw2's name.
  it("reads the weathers, the Pokémon's conditions and its stats, and no side's or field's condition", () => {
    expect(battleNumbers(SOURCES).constants).toEqual({
      BTL_WEATHER_RAIN: 0x21,
      BTL_WEATHER_NONE: 0x20,
      BTL_WEATHER_SUN: 0x24,
      CONDITION_BURN: 17,
      CONDITION_SLEEP: 9,
      CONDITION_NONE: 12,
      BATTLEMON_SPEED_STAGE: 30,
      BATTLEMON_HP: 26,
      BATTLEMON_ATTACK: 27,
    })
  })

  it('refuses a battle header without one of the prefixes or with a computed condition', () => {
    const battleH = (from: string | RegExp, to: string) => ({
      ...SOURCES,
      battleH: SOURCES.battleH.replace(from, to),
    })
    expect(() => battleNumbers(battleH(/^#define BTL_WEATHER_.*$/gm, ''))).toThrow(/BTL_WEATHER_/)
    expect(() => battleNumbers(battleH('CONDITION_SLEEP 9', 'CONDITION_SLEEP (1 << 3)'))).toThrow(
      /CONDITION_SLEEP/,
    )
  })

  it('refuses a BattleMon whose first member is not its core, whose offsets it borrows', () => {
    const odd = SOURCES.pokeparamH.replace(
      'BattleMonCore core; s8 boost;',
      's8 boost; BattleMonCore core;',
    )
    expect(() => battleNumbers({ ...SOURCES, pokeparamH: odd })).toThrow(/BattleMonCore core/)
  })
})
