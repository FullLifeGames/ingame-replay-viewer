import { describe, expect, it } from 'vitest'

import { battleNumbers, type BattleSources } from './gen5-bw2-battle'

// Invented sources for the spec: the struct and member names the reader looks up, among members,
// orders and sizes of their own.
const SOURCES: BattleSources = {
  serverC: 'enum { STEP_ZERO, STEP_ONE = 4, BTL_SERVER_ACTION_SEQ_WAIT_SELECT, STEP_LAST };',
  serverH: `typedef BOOL (*Turn)(int *n);
struct BtlServer { u8 open; u16 round; Turn turn; void *pokeCon; Mystery tail[COUNT]; };`,
  mainH: `struct BattleParty { u8 count; void *mons[3]; };
struct BtlPokeCon { BOOL forServer; BattleParty parties[2]; void *mainModule; };
struct BtlMainModule { u16 id; void *server; Mystery rest[COUNT]; };`,
  pokeparamH: `typedef struct { u16 hp; u32 seen; u16 species; u8 monId; Mystery more[COUNT]; } BattleMonCore;
struct BattleMon { BattleMonCore core; s8 boost; };`,
}

// Scene: the page follows pointers from the server to the Pokémon at offsets from the structs.
describe('battleNumbers', () => {
  it('lays out the structs on the way, the cut ones up to the member the spike reads', () => {
    const battle = battleNumbers(SOURCES)
    expect(battle.server.fields.pokeCon).toEqual({ offset: 8, size: 4 })
    expect(battle.server.upTo).toBe('pokeCon')
    expect(battle.mainModule.fields.server).toEqual({ offset: 4, size: 4 })
    expect(battle.pokeCon.size).toBe(0x28)
    expect(battle.pokeCon.fields.forServer).toEqual({ offset: 0, size: 4 })
    expect(battle.pokeCon.fields['parties.mons']).toEqual({ offset: 8, size: 12 })
    expect(battle.party.size).toBe(0x10)
    expect(battle.monCore.fields.monId).toEqual({ offset: 10, size: 1 })
    expect(battle.waitSelectSeq).toBe(5)
  })

  it('refuses a BattleMon whose first member is not its core, whose offsets it borrows', () => {
    const odd = SOURCES.pokeparamH.replace(
      'BattleMonCore core; s8 boost;',
      's8 boost; BattleMonCore core;',
    )
    expect(() => battleNumbers({ ...SOURCES, pokeparamH: odd })).toThrow(/BattleMonCore core/)
  })
})
