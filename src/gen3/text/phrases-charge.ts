// Phrases for the charge turn of a two-turn move (#65): the string the pinned `gMovesInfo` names
// for the move (`.argument.twoTurnAttack.stringId`, read through `tables/charge.ts`), with the
// user as B_ATK. The templates cover the two-turn moves of Gen 1 to 5 (#105); a later move that
// shares one of their strings, such as Phantom Force, takes it by the string (D11). Sky Drop's
// line names its target as B_DEF; a Sky Drop with no target keeps our line.
import { type Mon, moveName, nameAtStart, nameInside } from './names'
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
  vanished: tagged('STRINGID_VANISHEDINSTANTLY', start('vanished instantly!')),
  freezingLight: tagged(
    'STRINGID_CLOAKEDINAFREEZINGLIGHT',
    start('became cloaked in a freezing light!'),
  ),
  tookTarget: tagged('STRINGID_PKMNTOOKTARGETHIGH', (who: Mon, target: Mon) => {
    return `${nameAtStart(who)} took ${nameInside(target)} into the sky!`
  }),
}

const { tookTarget, ...OF_USER } = CHARGE_TEMPLATES

const BY_STRING: ReadonlyMap<string, (who: Mon) => string> = new Map(
  Object.values(OF_USER).map(({ id, render }) => [id, render]),
)

/**
 * What `who` says as it charges `move` at `target`, by the move's string from the charge-turn
 * table.
 */
export function chargeLine(
  who: Mon,
  move: string,
  stringId: string | undefined,
  target: Mon | undefined,
): Phrase {
  const takesTarget = stringId === tookTarget.id
  if (takesTarget && target !== undefined) return { text: tookTarget.render(who, target) }
  const render = stringId === undefined ? undefined : BY_STRING.get(stringId)
  if (render !== undefined) return { text: render(who) }
  const own = `${nameAtStart(who)} is charging ${moveName(move)}!`
  return ownPhrase(own, `the charge turn of ${move}${takesTarget ? ' with no target' : ''}`)
}
