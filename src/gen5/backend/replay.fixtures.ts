// The invented numbers of the Gen 5 backend's specs (#106, #107): the Pokémon format and the entry
// of src/gen5's fixtures, a font of printable ASCII, a made-up pin, and the numbers the blocks
// need. The server commands keep pokebw2's `SC_*` names with numbers above any the game has; the
// formats carry names, codes and puts of their own, each argument in a halfword. The labels keep
// pokebw2's names with message IDs of their own, and the battle's clients sit in an order of
// their own. scripts/gen5-fixtures-real.test.ts holds that no number here equals the generated one
// under the same name.
import { ADAPTER_LAYOUT } from '../adapter.fixtures.ts'
import type { ArgFormat } from '../bw2-numbers.ts'
import { ENTRY } from '../direct-entry.fixtures.ts'
import { TEAM_PKM } from '../pkm.fixtures.ts'
import type { ReplayNumbers } from './replay.ts'

/** A format of `argCount` arguments, each written as a halfword. */
const halves = (code: number, argCount: number): ArgFormat => ({
  code,
  argCount,
  puts: Array.from({ length: argCount }, (_, arg) => ({
    bytes: 2,
    fields: [{ arg, mask: 0xffff, shift: 0 }],
  })),
})

export const REPLAY_NUMBERS: ReplayNumbers = {
  pkm: TEAM_PKM,
  entry: ENTRY,
  font: { chars: Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') },
  pokebw2: { repository: 'https://example.invalid/pokebw2.git', commit: 'c0ffee' },
  serverCommands: {
    SC_MSG_SET: 0x6a52,
    SC_MOVE_ANIM: 0x6a07,
    SC_UPDATE_HP_GAUGE: 0x6a22,
    SC_MSG_STD: 0x6a50,
    SC_OP_ADD_HP: 0x6a31,
    SC_DAMAGE_PLURAL: 0x6a15,
    SC_MOVE_MSG: 0x6a11,
    SC_EFFECT_BY_POS: 0x6a44,
    SC_OP_SUBTRACT_HP: 0x6a30,
    SC_USE_HELD_ITEM: 0x6a40,
    SC_MSG_STD_SE: 0x6a51,
  },
  argFormats: {
    HALF_ONE: halves(0x41, 1),
    HALF_TWO: halves(0x42, 2),
    HALF_THREE: halves(0x43, 3),
    HALF_FOUR: halves(0x44, 4),
    SAY: halves(0x48, 0),
    SAY_SE: halves(0x49, 0),
  },
  commandFormats: {
    SC_MSG_SET: 'SAY',
    SC_MOVE_ANIM: 'HALF_FOUR',
    SC_UPDATE_HP_GAUGE: 'HALF_ONE',
    SC_MSG_STD: 'SAY',
    SC_OP_ADD_HP: 'HALF_TWO',
    SC_DAMAGE_PLURAL: 'HALF_THREE',
    SC_MOVE_MSG: 'HALF_TWO',
    SC_EFFECT_BY_POS: 'HALF_TWO',
    SC_OP_SUBTRACT_HP: 'HALF_TWO',
    SC_USE_HELD_ITEM: 'HALF_ONE',
    SC_MSG_STD_SE: 'SAY_SE',
  },
  messages: { formats: ['SAY', 'SAY_SE'], soundCommand: 'SC_MSG_STD_SE', argEnd: 0x7e5d0000 },
  adapter: ADAPTER_LAYOUT,
  queueSize: 0x30,
  text: {
    standard: {
      Bank0019_Text_ButFailed: 0x4b85,
      Bank0019_Text_CriticalHit: 0x4b8b,
      Bank0019_Text_ItsNotVeryEffective: 0x4b91,
      Bank0019_Text_ItsSuperEffective: 0x4b97,
    },
    set: {
      Bank0018_Text_RestoredLittleHpUsing: 0x4bad,
      Bank0018_Text_AvoidedAttack: 0x4bb3,
      Bank0018_Text_DoesntAffect: 0x4bb9,
    },
  },
  flow: { damageKinds: { resisted: 12, super: 17, plain: 15 }, recoverEffect: 0x6d3 },
  battle: {
    single: { clientCount: 4, posClientIds: [3, 2], clients: { player: 3, opponent: 2 } },
    monIds: { firstByClient: [30, 20, 10, 40], perClient: 9 },
  },
}
