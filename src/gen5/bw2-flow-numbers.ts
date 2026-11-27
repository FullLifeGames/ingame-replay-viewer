// The numbers of Black 2's battle server that its flow and handlers put, read from pokebw2 by
// scripts/gen5-bw2-flow.ts and scripts/gen5-bw2-effects.ts into the keys `flow` and `effects` of
// build/gen5/bw2.json (#107 to #110). Bw2Numbers in bw2-numbers.ts holds both.

/** The numbers the server's flow puts as literals (scripts/gen5-bw2-flow.ts), which pokebw2 has
 * no name for (#107, #108, #110). */
export interface FlowNumbers {
  /** The effectiveness category of the hit flash's SC_DAMAGE_PLURAL, which picks the hit sound. */
  damageKinds: { plain: number; super: number; resisted: number }
  /** The effect SC_EFFECT_BY_POS shows at a Pokémon that heals. */
  recoverEffect: number
  /** The effects SC_RECALL shows as a Pokémon leaves: by a switch, or by a drag (#108). */
  switchEffects: { switchOut: number; drag: number }
  /** The flag of SC_FAINT_HP_GAUGE for a Pokémon that faints with HP left (#108). */
  faintGaugeFlag: number
  /** The index SC_MOVE_ANIM shows as a charged move fires (ServerControl_CheckChargeTurn, #110). */
  chargeRelease: number
}

/** The numbers of the effects' sequences (scripts/gen5-bw2-effects.ts, #109), conditions and
 * abilities by pokebw2's names. */
export interface EffectNumbers {
  /** The effect shown at a Pokémon as a condition starts (ServerControl_AddCondition). */
  addEffects: Record<string, number>
  /** The effect shown at a Pokémon that poison or a burn hurts (ServerControl_ConditionDamage). */
  damageEffects: Record<string, number>
  /** SC_OP_SET_CONDITION's values: a status for good, bad poison, sleep at its most turns. */
  conditionValues: { permanent: number; badlyPoisoned: number; sleep: number }
  /** The icon SC_SET_GAUGE_STATUS shows for bad poison (ServerDisplay_AddCondition). */
  badlyPoisonedGauge: number
  /** SC_WEATHER_START's turns for a weather that lasts (BtlServerFlow_StartBattle). */
  weatherTurns: number
  /** A client's side is `client & sideMask` (GetClientSide). */
  sideMask: number
  /** Sand's and hail's effects: at each Pokémon hit, and once over the field after the hits. */
  sandEffects: { hit: number; after: number }
  /** SC_HIDE_MSG_WINDOW's argument as the turn's end starts (ServerControl_TurnCheck). */
  hideWindow: number
  /** The effect at Focus Punch's user before its turn (HandlerFocuspunch). */
  focusEffect: number
  /** The abilities whose handlers run as their Pokémon comes in (BTL_EVENT_MEMBER_IN). */
  memberInAbilities: string[]
}
