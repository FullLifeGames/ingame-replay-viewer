// Phrases for the charge turn of a two-turn move (#65): the string the pinned `gMovesInfo` names
// for the move (`.argument.twoTurnAttack.stringId`, read through `tables/charge.ts`), with the
// user as B_ATK. The templates cover the two-turn moves of Gen 1 to 3.
import { type Mon, moveName, nameAtStart } from './names'
import { ownPhrase, type Phrase, tagged } from './template'

const start = (rest: string) => (who: Mon) => `${nameAtStart(who)} ${rest}`

export const CHARGE_TEMPLATES = {
  whirlwind: tagged('STRINGID_PKMNWHIPPEDWHIRLWIND', start('whipped up a whirlwind!')),
  sunlight: tagged('STRINGID_PKMNTOOKSUNLIGHT', start('absorbed light!')),
  head: tagged('STRINGID_PKMNLOWEREDHEAD', start('tucked in its head!')),
  flew: tagged('STRINGID_PKMNFLEWHIGH', start('flew up high!')),
  dug: tagged('STRINGID_PKMNDUGHOLE', start('burrowed its way under the ground!')),
  underwater: tagged('STRINGID_PKMNHIDUNDERWATER', start('hid underwater!')),
  sprang: tagged('STRINGID_PKMNSPRANGUP', start('sprang up!')),
  harshLight: tagged('STRINGID_CLOAKEDINAHARSHLIGHT', start('became cloaked in a harsh light!')),
}

const BY_STRING: ReadonlyMap<string, (who: Mon) => string> = new Map(
  Object.values(CHARGE_TEMPLATES).map(({ id, render }) => [id, render]),
)

/** What `who` says as it charges `move`, by the move's string from the charge-turn table. */
export function chargeLine(who: Mon, move: string, stringId: string | undefined): Phrase {
  const render = stringId === undefined ? undefined : BY_STRING.get(stringId)
  if (render !== undefined) return { text: render(who) }
  const own = `${nameAtStart(who)} is charging ${moveName(move)}!`
  return ownPhrase(own, `the charge turn of ${move}`)
}
