// The lines of Black 2's text banks that the Gen 5 backend sends (#107), each by its label in
// pokebw2's bank and with the C that puts it in the server's flow. The generator checks each label
// against the message IDs its function puts (scripts/gen5-bw2-flow.ts, D9), so a pin that moves a
// line fails by the line's label; the backend finds the line's ID in bw2.json by its label.
import type { TextNumbers } from '../bw2-numbers.ts'

/** The C that puts a line: its file in pokebw2, its function, and the put. `PutMsg` names the
 * message command the ID goes through; `StrSetup set` is a handler's string of the set kind
 * (`BattleHandler_StrSetup` with `BTL_HANDLER_STRING_SET`), which goes out as SC_MSG_SET. */
interface LineSource<Put extends string> {
  readonly file: string
  readonly function: string
  readonly put: Put
}

/** A standard line goes out as SC_MSG_STD, a set line as SC_MSG_SET, and the game picks the set
 * line's variant for the player's, a wild or the foe's Pokémon itself. */
export type Gen5Line =
  | { readonly bank: 'standard'; readonly label: string; readonly source: StandardSource }
  | { readonly bank: 'set'; readonly label: string; readonly source: SetSource }

type StandardSource = LineSource<'PutMsg SC_MSG_STD'>
type SetSource = LineSource<'PutMsg SC_MSG_SET' | 'StrSetup set'>

const FLOW = 'src/battle/btl_server_flow.c'

const standard = (label: string, fn: string): Gen5Line => ({
  bank: 'standard',
  label: `Bank0019_Text_${label}`,
  source: { file: FLOW, function: fn, put: 'PutMsg SC_MSG_STD' },
})

const set = (label: string, source: SetSource): Gen5Line => ({
  bank: 'set',
  label: `Bank0018_Text_${label}`,
  source,
})

/** The lines of a single battle's hits, misses, failures and a heal by Leftovers. */
export const GEN5_LINES = {
  superEffective: standard('ItsSuperEffective', 'ServerDisplay_EffectivenessMessageMulti'),
  notVeryEffective: standard('ItsNotVeryEffective', 'ServerDisplay_EffectivenessMessageMulti'),
  critical: standard('CriticalHit', 'ServerDisplay_CriticalHitMessage'),
  failed: standard('ButFailed', 'ServerDisplay_MoveFailed'),
  avoided: set('AvoidedAttack', {
    file: FLOW,
    function: 'ServerDisplay_MoveAvoided',
    put: 'PutMsg SC_MSG_SET',
  }),
  doesNotAffect: set('DoesntAffect', {
    file: FLOW,
    function: 'ServerDisplay_DoesntAffect',
    put: 'PutMsg SC_MSG_SET',
  }),
  leftovers: set('RestoredLittleHpUsing', {
    file: 'src/battle/handler/item_handlers.c',
    function: 'HandlerLeftoversUse',
    put: 'StrSetup set',
  }),
} as const satisfies Record<string, Gen5Line>

/** The message ID of a line: its index in its bank, by its label. */
export function lineId(text: TextNumbers, line: Gen5Line): number {
  const id = text[line.bank][line.label]
  if (id === undefined) throw new Error(`bw2.json has no ${line.label}`)
  return id
}
