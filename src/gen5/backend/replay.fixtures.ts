// The invented numbers of the Gen 5 backend's specs (#106 to #109): the Pokémon format and
// the entry of src/gen5's fixtures, a font of printable ASCII, a made-up pin, and the numbers the
// blocks need. The server commands keep pokebw2's `SC_*` names with numbers above any the game
// has; the formats carry names, codes and puts of their own, each argument in a halfword. The
// labels keep pokebw2's names with message IDs of their own, and the battle's clients sit in an
// order of their own. scripts/gen5-fixtures-real.test.ts holds that no number here equals the
// generated one under the same name.
import { ADAPTER_LAYOUT } from '../adapter.fixtures.ts'
import type { ArgFormat, Bw2Numbers } from '../bw2-numbers.ts'
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

/** The replay's numbers with the effects' (#109), which the backend picks once its sequences are
 * wired. */
export const REPLAY_NUMBERS: ReplayNumbers & Pick<Bw2Numbers, 'effects'> = {
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
    SC_RECALL_MSG: 0x6a24,
    SC_OP_SEND_IN: 0x6a36,
    SC_FAINT: 0x6a27,
    SC_RECALL: 0x6a25,
    SC_OP_ZERO_HP: 0x6a37,
    SC_OP_CLEAR_FOR_SWITCH: 0x6a34,
    SC_SEND_OUT: 0x6a26,
    SC_FAINT_HP_GAUGE: 0x6a28,
    SC_OP_SETUP_ILLUSION: 0x6a35,
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
    SC_RECALL_MSG: 'HALF_TWO',
    SC_OP_SEND_IN: 'HALF_FOUR',
    SC_FAINT: 'HALF_ONE',
    SC_RECALL: 'HALF_TWO',
    SC_OP_ZERO_HP: 'HALF_ONE',
    SC_OP_CLEAR_FOR_SWITCH: 'HALF_ONE',
    SC_SEND_OUT: 'HALF_FOUR',
    SC_FAINT_HP_GAUGE: 'HALF_TWO',
    SC_OP_SETUP_ILLUSION: 'HALF_ONE',
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
      Bank0018_Text_DraggedOut: 0x4bbf,
      Bank0018_Text_Fainted: 0x4bc5,
    },
  },
  flow: {
    damageKinds: { resisted: 12, super: 17, plain: 15 },
    recoverEffect: 0x6d3,
    switchEffects: { switchOut: 0x6d9, drag: 0x6df },
    faintGaugeFlag: 3,
  },
  effects: {
    addEffects: {
      CONDITION_SLEEP: 0x6e1,
      CONDITION_POISON: 0x6e3,
      CONDITION_BURN: 0x6e5,
      CONDITION_PARALYSIS: 0x6e7,
      CONDITION_FREEZE: 0x6e9,
    },
    damageEffects: { CONDITION_POISON: 0x6ed, CONDITION_BURN: 0x6ef },
    conditionValues: { permanent: 0x1e40, badlyPoisoned: 0x1e57, sleep: 0x2c90 },
    badlyPoisonedGauge: 0x2d,
    weatherTurns: 0x5a,
    sideMask: 0x20,
    sandEffects: { hit: 0x6f3, after: 0x6f5 },
    hideWindow: 5,
    focusEffect: 0x6f9,
    memberInAbilities: ['ABILITY_SAND_STREAM', 'ABILITY_DRIZZLE', 'ABILITY_INTIMIDATE'],
  },
  battle: {
    single: { clientCount: 4, posClientIds: [3, 2], clients: { player: 3, opponent: 2 } },
    monIds: { firstByClient: [30, 20, 10, 40], perClient: 9 },
  },
}
