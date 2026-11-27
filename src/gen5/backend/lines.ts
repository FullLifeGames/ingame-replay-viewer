// The lines of Black 2's text banks that the Gen 5 backend sends (#107, #108), each by its label in
// pokebw2's bank and with the C that puts it in the server's flow. The generator checks each label
// against the message IDs its function puts (scripts/gen5-bw2-flow.ts, D9), so a pin that moves a
// line fails by the line's label; the backend finds the line's ID in bw2.json by its label.
import type { TextNumbers } from '../bw2-numbers.ts'

/** The C that puts a line: its file in pokebw2, its function, and the put. `PutMsg` names the
 * message command the ID goes through; `StrSetup set` is a handler's string of the set kind
 * (`BattleHandler_StrSetup` with `BTL_HANDLER_STRING_SET`), which goes out as SC_MSG_SET; and
 * `message literal` is a function that picks the ID by a switch or passes it on to the function
 * that puts it, so the ID stands among its number literals (#109). */
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

export type StandardSource = LineSource<'PutMsg SC_MSG_STD' | 'message literal'>
export type SetSource = LineSource<'PutMsg SC_MSG_SET' | 'StrSetup set' | 'message literal'>

/** The server's flow, where most lines are put. */
export const FLOW = 'src/battle/btl_server_flow.c'

/** A line of the standard bank by the end of its label. */
export const standardLine = (label: string, source: StandardSource): Gen5Line => ({
  bank: 'standard',
  label: `Bank0019_Text_${label}`,
  source,
})

/** A line of the set bank by the end of its label. */
export const setLine = (label: string, source: SetSource): Gen5Line => ({
  bank: 'set',
  label: `Bank0018_Text_${label}`,
  source,
})

const standard = (label: string, fn: string): Gen5Line =>
  standardLine(label, { file: FLOW, function: fn, put: 'PutMsg SC_MSG_STD' })

/** The lines of a single battle's hits, misses, failures, a heal by Leftovers, a faint and a
 * drag. */
export const GEN5_LINES = {
  superEffective: standard('ItsSuperEffective', 'ServerDisplay_EffectivenessMessageMulti'),
  notVeryEffective: standard('ItsNotVeryEffective', 'ServerDisplay_EffectivenessMessageMulti'),
  critical: standard('CriticalHit', 'ServerDisplay_CriticalHitMessage'),
  failed: standard('ButFailed', 'ServerDisplay_MoveFailed'),
  avoided: setLine('AvoidedAttack', {
    file: FLOW,
    function: 'ServerDisplay_MoveAvoided',
    put: 'PutMsg SC_MSG_SET',
  }),
  doesNotAffect: setLine('DoesntAffect', {
    file: FLOW,
    function: 'ServerDisplay_DoesntAffect',
    put: 'PutMsg SC_MSG_SET',
  }),
  leftovers: setLine('RestoredLittleHpUsing', {
    file: 'src/battle/handler/item_handlers.c',
    function: 'HandlerLeftoversUse',
    put: 'StrSetup set',
  }),
  fainted: setLine('Fainted', {
    file: FLOW,
    function: 'ServerControl_CheckFainted',
    put: 'PutMsg SC_MSG_SET',
  }),
  draggedOut: setLine('DraggedOut', {
    file: FLOW,
    function: 'ServerControl_ForceSwitchCore',
    put: 'PutMsg SC_MSG_SET',
  }),
} as const satisfies Record<string, Gen5Line>

/** The message ID of a line: its index in its bank, by its label. */
export function lineId(text: TextNumbers, line: Gen5Line): number {
  const id = text[line.bank][line.label]
  if (id === undefined) throw new Error(`bw2.json has no ${line.label}`)
  return id
}
