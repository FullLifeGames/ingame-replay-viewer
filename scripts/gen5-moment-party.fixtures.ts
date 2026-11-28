// The invented numbers of the moment's party refs (scripts/gen5-moment-party.ts): the mon ID's
// offset in BattleMonCore, under pokebw2's names, with a size and an offset of their own.
// scripts/gen5-fixtures-real.test.ts holds that no number here equals the generated one under the
// same name.
import type { BattleNumbers } from '../src/gen5/bw2-numbers.ts'

/** The mon ID's invented offset in BattleMonCore. */
export const MON_ID_AT = 0x31

export const PARTY_NUMBERS = {
  battle: { monCore: { size: 0x40, fields: { monId: { offset: MON_ID_AT, size: 1 } } } },
} as unknown as { battle: BattleNumbers }
