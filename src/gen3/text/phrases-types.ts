// Phrases for a change of a Pokémon's types (#88). The expansion picks the line by what made the
// change, so the line here follows the log's cause. A change the game words otherwise (Burn Up,
// Double Shock, Mimicry), a cause it lacks, and a change to two types or to "???" have no line
// here: the caller lists them.
import { Dex, toID } from '@pkmn/dex'

import type { Effect } from '../../script/types'
import { type Mon, nameAtStart, nameInside, ownerAtStart } from './names'
import { tagged } from './template'

export const TYPE_TEMPLATES = {
  // `BattleScript_ProteanActivates`, inside the pop-up of Protean or Libero, with the holder as
  // B_ATK; Conversion, Conversion 2 and Camouflage print it with the user as B_ATK. B_BUFF1 is
  // the type.
  changedType: tagged('STRINGID_PKMNCHANGEDTYPE', (who: Mon, type: string) => {
    return `${nameAtStart(who)} transformed into the ${type} type!`
  }),
  // `BattleScript_ColorChangeActivates`, inside the pop-up, with the holder as B_EFF.
  changedTypeWith: tagged('STRINGID_PKMNCHANGEDTYPEWITH', (who: Mon, type: string) => {
    return `${ownerAtStart(who)} type changed to ${type}!`
  }),
  // `BattleScript_EffectReflectType`, with the user as B_ATK and its target as B_DEF.
  reflectedType: tagged('STRINGID_REFLECTTARGETSTYPE', (who: Mon, target: Mon) => {
    return `${nameAtStart(who)} became the same type as ${nameInside(target)}!`
  }),
  // `BattleScript_EffectThirdType` (Trick-or-Treat, Forest's Curse), with the target as B_DEF.
  typeAdded: tagged('STRINGID_THIRDTYPEADDED', (who: Mon, type: string) => {
    return `${type} type was added to ${nameInside(who)}!`
  }),
}

const T = TYPE_TEMPLATES

/** What a start line reads beside its Pokémon: `[of]`'s Pokémon, `[from]`'s effect, the detail. */
export interface TypeChange {
  readonly cause?: Effect | undefined
  readonly source?: Mon | undefined
  readonly detail?: string | undefined
}

/**
 * The lines of a change to one type, by the id of its cause. Showdown logs Conversion,
 * Conversion 2, Camouflage, Soak and Magic Powder with no cause; Soak and Magic Powder print
 * STRINGID_TARGETCHANGEDTYPE, whose words are those of STRINGID_PKMNCHANGEDTYPE.
 */
const BY_CAUSE: Readonly<Record<string, (who: Mon, type: string) => string>> = {
  protean: T.changedType.render,
  libero: T.changedType.render,
  colorchange: T.changedTypeWith.render,
}

/** Reflect Type logs no type: it names the Pokémon whose types it took as `[of]`. */
const REFLECT_TYPE = 'reflecttype'

/** The one type `detail` names, as the game names each type (D16); none for two or "???". */
function oneType(detail: string | undefined): string | undefined {
  const type = detail === undefined ? undefined : Dex.types.get(detail)
  return type?.exists ? type.name : undefined
}

/** The game's line for `who`'s change of types, if it has one for this cause. */
export function typeChanged(who: Mon, { cause, source, detail }: TypeChange): string | undefined {
  const id = cause === undefined ? undefined : toID(cause.name)
  if (id === REFLECT_TYPE) return source && T.reflectedType.render(who, source)
  const type = oneType(detail)
  if (type === undefined) return undefined
  return id === undefined ? T.changedType.render(who, type) : BY_CAUSE[id]?.(who, type)
}

/** The game's line for a type added to `who`'s types. */
export function typeAdded(who: Mon, { detail }: TypeChange): string | undefined {
  const type = oneType(detail)
  return type && T.typeAdded.render(who, type)
}
