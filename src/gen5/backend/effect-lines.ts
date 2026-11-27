// The lines of Black 2's text banks that the Gen 5 backend sends for a battle's effects (#109):
// statuses, stat stages, a weather's damage, Stealth Rock, held items, an ability and the moves'
// own effects, each by its label in pokebw2's bank and with the C that puts or picks it. The
// generator holds each label to the message IDs its function puts (scripts/gen5-bw2-lines.ts), as
// for GEN5_LINES, and the backend finds the line's ID in bw2.json by its label (`lineId`). Each
// label is the player's row; the game picks the wild or the foe's row itself.
import { FLOW, type Gen5Line, type SetSource, setLine, standardLine } from './lines.ts'

const HANDLERS = 'src/battle/handler'
const ITEMS = `${HANDLERS}/item_handlers.c`
const MOVES = `${HANDLERS}/move_handlers.c`

/** The source of a line put in `file` by `put`, by its function. */
const putIn =
  <Put extends SetSource['put']>(file: string, put: Put) =>
  (fn: string) => ({ file, function: fn, put })

const flowSet = putIn(FLOW, 'PutMsg SC_MSG_SET')
const flowString = putIn(FLOW, 'StrSetup set')
const flowPicked = putIn(FLOW, 'message literal')
const itemString = putIn(ITEMS, 'StrSetup set')
const moveString = putIn(MOVES, 'StrSetup set')
const conditionPicked = putIn(`${HANDLERS}/condition_effects.c`, 'message literal')

/** A status starts: the line GetConditionAddMessage picks by condition, bad poison apart. */
const added = (label: string) => setLine(label, conditionPicked('GetConditionAddMessage'))

/** The lines of a status: its start, Toxic Orb's, its damage, its cure, and the turn it stops a
 * move (ServerDisplay_MoveFailMessage by cause). */
const STATUS_LINES = {
  burned: added('Burned'),
  paralyzed: added('ParalyzedMayUnableMove'),
  frozen: added('FrozenSolid'),
  fellAsleep: added('FellAsleep'),
  poisoned: added('Poisoned'),
  badlyPoisoned: added('BadlyPoisoned'),
  toxicOrb: setLine('BadlyPoisonedBy', itemString('HandlerToxicOrb')),
  hurtByPoison: setLine('HurtByPoison', conditionPicked('GetConditionDamageMessage')),
  hurtByBurn: setLine('HurtByItsBurn', conditionPicked('GetConditionDamageMessage')),
  wokeUp: setLine('WokeUp', flowSet('ServerControl_CureStatus')),
  thawed: setLine('ThawedOut', flowSet('ServerControl_CureStatus')),
  statusCured: setLine('SStatusReturnedNormal', flowSet('ServerControl_CureStatus')),
  fastAsleep: setLine('FastAsleep', flowSet('ServerDisplay_MoveFailMessage')),
  fullyParalyzed: setLine('ParalyzedCantMove', flowSet('ServerDisplay_MoveFailMessage')),
  frozenSolid: setLine('FrozenSolid_2', flowSet('ServerDisplay_MoveFailMessage')),
  flinched: setLine('FlinchedCouldntMove', flowSet('ServerDisplay_MoveFailMessage')),
} as const satisfies Record<string, Gen5Line>

/** A stat stage up or down, and at its limit: the game picks the stat, the degree and the row
 * from the arguments (FormatStatChange, FormatStatLimit in btl_string.c). */
const STAT_LINES = {
  statRose: setLine('SAttackRose', flowSet('ServerDisplay_StatChange')),
  statFell: setLine('SAttackFell', flowSet('ServerDisplay_StatChange')),
  statWontRise: setLine('SAttackWontGo', flowSet('ServerDisplay_StatChangeLimit')),
  statWontFall: setLine('SAttackWontGo_2', flowSet('ServerDisplay_StatChangeLimit')),
} as const satisfies Record<string, Gen5Line>

/** Sand's and hail's damage, and Stealth Rock's set, hit and end; the game picks the foe's row of
 * a side's line by the side argument. Rapid Spin's clearing shows ServerDisplay_SideEffectEnd's
 * line, through BattleHandler_RemoveSideEffectCore. */
const FIELD_LINES = {
  sandHurts: setLine('BuffetedBySandstorm', flowString('ServerControl_WeatherDamage')),
  hailHurts: setLine('BuffetedByHail', flowString('ServerControl_WeatherDamage')),
  stealthRockSet: standardLine('PointedStonesFloatAir', {
    file: MOVES,
    function: 'HandlerStealthRock',
    put: 'message literal',
  }),
  stealthRockHit: setLine('PointedStonesDugInto', {
    file: `${HANDLERS}/side_handlers.c`,
    function: 'HandlerSideStealthRock',
    put: 'StrSetup set',
  }),
  stealthRockEnd: standardLine(
    'PointedStonesDisappearedFrom',
    flowPicked('ServerDisplay_SideEffectEnd'),
  ),
} as const satisfies Record<string, Gen5Line>

/** A held item's lines, Knock Off's, and Iron Barbs' (HandlerRoughSkin). */
const ITEM_AND_ABILITY_LINES = {
  sitrusBerry: setLine('RestoredItsHealthUsing', itemString('HandlerSitrusBerryUse')),
  custapBerry: setLine('SLetMoveFirst', itemString('HandlerCustapBerryUse')),
  lifeOrb: setLine('LostSomeItsHp', itemString('HandlerLifeOrbReaction')),
  airBalloon: setLine('FloatsAirItsAir', itemString('HandlerAirBalloonMemberIn')),
  airBalloonPopped: setLine('SAirBalloonPopped', itemString('HandlerAirBalloonDamageReaction')),
  knockedOff: setLine('KnockedOffS', moveString('HandlerKnockOff')),
  ironBarbs: setLine('Hurt_2', {
    file: `${HANDLERS}/ability_handlers.c`,
    function: 'HandlerRoughSkin',
    put: 'StrSetup set',
  }),
} as const satisfies Record<string, Gen5Line>

/** The moves' own effects: Protect and its block, Focus Punch, a drain, and Substitute's start,
 * hit and end (the hit and the end pass their line to ServerDisplay_SkyDropTargetAppear). */
const MOVE_LINES = {
  protected: setLine('ProtectedItself', moveString('HandlerProtect')),
  protectBlocked: setLine('ProtectedItself_2', flowSet('ServerControl_RemoveNoEffectTargets')),
  focusing: setLine('TighteningItsFocus', moveString('HandlerFocuspunch')),
  drained: setLine('HadItsEnergyDrained', flowPicked('ServerControl_DamageDrain')),
  substitute: setLine('PutSubstitute', flowSet('ServerControl_Substitute')),
  substituteHit: setLine('SubstituteTookDamage', flowPicked('ServerControl_DamageSubstitute')),
  substituteFaded: setLine('SSubstituteFaded', flowPicked('ServerControl_BreakSubstitute')),
} as const satisfies Record<string, Gen5Line>

/** Every line of the effects, by our name. */
export const GEN5_EFFECT_LINES = {
  ...STATUS_LINES,
  ...STAT_LINES,
  ...FIELD_LINES,
  ...ITEM_AND_ABILITY_LINES,
  ...MOVE_LINES,
} as const satisfies Record<string, Gen5Line>
