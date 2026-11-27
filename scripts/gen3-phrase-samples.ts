// Samples for the pinned-tree phrase spec (P2, `gen3-phrases.test.ts`): the arguments each tagged
// template takes and the values the pinned string's placeholders take in the same scene. The
// spec renders both and holds them equal. A template that takes one Pokémon and no other value
// needs no sample: it gets the far Pokémon, which every Pokémon placeholder names by default.
import type { Mon } from '../src/gen3/text/names.ts'
import type { AnyTemplate } from '../src/gen3/text/template.ts'
import { CHARGE_TEMPLATES } from '../src/gen3/text/phrases-charge.ts'
import { EFFECT_TEMPLATES } from '../src/gen3/text/phrases-effects.ts'
import { FIELD_TEMPLATES } from '../src/gen3/text/phrases-field.ts'
import { HP_TEMPLATES } from '../src/gen3/text/phrases-hp.ts'
import { ITEM_TEMPLATES } from '../src/gen3/text/phrases-items.ts'
import { CANT_TEMPLATES, STATUS_TEMPLATES } from '../src/gen3/text/phrases-status.ts'
import { TURN_TEMPLATES } from '../src/gen3/text/phrases-turn.ts'
import { TYPE_TEMPLATES } from '../src/gen3/text/phrases-types.ts'
import { MOVE_TEMPLATES, STAT_TEMPLATES } from '../src/gen3/text/phrases.ts'
import { NAME_TEMPLATES } from '../src/gen3/text/names.ts'

/** What the game puts into a name it inserts: no-break spaces. Written here on its own. */
const nb = (text: string) => text.replaceAll(' ', ' ')

export const FAR: Mon = { side: 'far', name: nb('Machine Passage') }
const NEAR: Mon = { side: 'near', name: 'Dugtrio' }

const FAR_START = `The opposing ${nb('Machine Passage')}`
const FAR_INSIDE = `the opposing ${nb('Machine Passage')}`
const FOES = nb('The opposing')
const FOES_INSIDE = nb('the opposing')
const ERIC = nb('xX Eric')

/** Every Pokémon placeholder names the far Pokémon unless a sample says otherwise. */
export function defaultFill(placeholder: string): string | undefined {
  if (/^B_(ATK|DEF|EFF|SCR)_NAME_WITH_PREFIX$/.test(placeholder)) return FAR_START
  if (/^B_(ATK|DEF|EFF|SCR)_NAME_WITH_PREFIX2$/.test(placeholder)) return FAR_INSIDE
  if (/^B_(ATK|DEF|EFF)_TEAM1$/.test(placeholder)) return FOES
  if (/^B_(ATK|DEF|EFF)_TEAM2$/.test(placeholder)) return FOES_INSIDE
  return undefined
}

export interface Sample {
  readonly args: readonly unknown[]
  readonly fill?: Readonly<Record<string, string>>
}

/** Every tagged template, by group and name. */
export const TEMPLATE_GROUPS: Readonly<Record<string, Readonly<Record<string, AnyTemplate>>>> = {
  names: NAME_TEMPLATES,
  moves: MOVE_TEMPLATES,
  stats: STAT_TEMPLATES,
  hp: HP_TEMPLATES,
  status: STATUS_TEMPLATES,
  cant: CANT_TEMPLATES,
  field: FIELD_TEMPLATES,
  effects: EFFECT_TEMPLATES,
  turns: TURN_TEMPLATES,
  types: TYPE_TEMPLATES,
  items: ITEM_TEMPLATES,
  charge: CHARGE_TEMPLATES,
}

const withValue = (placeholder: string, value: string, ...before: unknown[]): Sample => ({
  args: [...before, value],
  fill: { [placeholder]: value },
})

const lumBerry = withValue('B_LAST_ITEM', nb('Lum Berry'), FAR)
const rockSlide = withValue('B_CURRENT_MOVE', nb('Rock Slide'), FAR)

export const SAMPLES: Readonly<Record<string, Sample>> = {
  'moves.usedMove': withValue('B_BUFF3', nb('Rock Slide'), FAR),
  'moves.hitCount': { args: [3], fill: { B_BUFF1: '3', B_BUFF2: 's' } },
  'stats.rose': {
    args: [FAR, nb('Sp. Atk'), nb(' sharply')],
    fill: { B_BUFF1: nb('Sp. Atk'), B_BUFF2: nb(' sharply') },
  },
  'stats.fell': {
    args: [FAR, 'Attack', nb('harshly ')],
    fill: { B_BUFF1: 'Attack', B_BUFF2: nb('harshly ') },
  },
  'stats.itemRose': {
    args: [FAR, nb('Berserk Gene'), 'Attack', nb(' sharply')],
    fill: { B_LAST_ITEM: nb('Berserk Gene'), B_BUFF1: 'Attack', B_BUFF2: nb(' sharply') },
  },
  'stats.itemFell': {
    args: [FAR, nb('Room Service'), 'Speed', ''],
    fill: { B_LAST_ITEM: nb('Room Service'), B_BUFF1: 'Speed', B_BUFF2: '' },
  },
  'stats.wontRise': withValue('B_BUFF1', 'Speed', FAR),
  'stats.wontFall': withValue('B_BUFF1', nb('Sp. Def'), FAR),
  'hp.trapped': withValue('B_BUFF1', nb('Fire Spin'), FAR),
  'hp.item': withValue('B_LAST_ITEM', nb('Shell Bell'), FAR),
  'hp.ability': {
    args: [NEAR, FAR, nb('Rough Skin')],
    fill: { B_ATK_NAME_WITH_PREFIX: 'Dugtrio', B_BUFF1: nb('Rough Skin') },
  },
  'hp.leftovers': withValue('B_LAST_ITEM', 'Leftovers', FAR),
  'hp.wish': { args: [FAR], fill: { B_BUFF1: FAR_START } },
  'status.itemParalysis': lumBerry,
  'status.itemPoison': lumBerry,
  'status.itemBurn': lumBerry,
  'status.itemFreeze': lumBerry,
  'status.itemSleep': lumBerry,
  'status.itemConfusion': withValue('B_LAST_ITEM', nb('Persim Berry'), FAR),
  'cant.taunt': rockSlide,
  'cant.disabled': rockSlide,
  'field.challenged': withValue('B_LINK_OPPONENT1_NAME', ERIC),
  'field.sentOut': {
    args: [ERIC, FAR.name],
    fill: { B_LINK_OPPONENT1_NAME: ERIC, B_BUFF1: FAR.name },
  },
  'field.go': withValue('B_BUFF1', FAR.name),
  'field.comeBack': withValue('B_BUFF1', FAR.name),
  'field.withdrew': {
    args: [ERIC, FAR.name],
    fill: { B_LINK_OPPONENT1_NAME: ERIC, B_BUFF1: FAR.name },
  },
  'field.spikes': { args: [FOES_INSIDE] },
  'field.stealthRock': { args: [FOES_INSIDE] },
  'field.toxicSpikes': { args: [FOES_INSIDE] },
  'field.toxicSpikesAbsorbed': { args: [FOES_INSIDE] },
  'field.stealthRockCleared': { args: [FOES_INSIDE] },
  'field.reflect': { args: [FOES_INSIDE] },
  'field.lightScreen': { args: [FOES_INSIDE] },
  'field.auroraVeil': { args: [FOES_INSIDE] },
  'field.safeguard': { args: [FOES] },
  'field.reflectGone': { args: [FOES] },
  'field.lightScreenGone': { args: [FOES] },
  'field.safeguardGone': { args: [FOES] },
  'field.woreOff': withValue('B_BUFF1', nb('Light Screen'), FOES),
  'effects.perish': withValue('B_BUFF1', '3', FAR),
  'effects.cursed': { args: [NEAR, FAR], fill: { B_ATK_NAME_WITH_PREFIX: 'Dugtrio' } },
  'effects.freed': withValue('B_BUFF1', nb('Fire Spin'), FAR),
  'effects.disabled': withValue('B_BUFF1', nb('Body Slam'), FAR),
  'effects.transformed': withValue('B_BUFF1', 'Tyranitar', FAR),
  'effects.terastallized': withValue('B_BUFF1', 'Fairy', FAR),
  'effects.tookAttack': withValue('B_BUFF1', nb('Future Sight'), FAR),
  'effects.bufferEnds': withValue('B_BUFF1', 'Taunt', FAR),
  'effects.inLoveWith': { args: [FAR, NEAR], fill: { B_SCR_NAME_WITH_PREFIX2: 'Dugtrio' } },
  'effects.tookAim': { args: [FAR, NEAR], fill: { B_DEF_NAME_WITH_PREFIX2: 'Dugtrio' } },
  'effects.copiedStats': { args: [FAR, NEAR], fill: { B_EFF_NAME_WITH_PREFIX2: 'Dugtrio' } },
  'effects.squeezed': { args: [FAR, NEAR], fill: { B_SCR_NAME_WITH_PREFIX2: 'Dugtrio' } },
  'effects.wrapped': { args: [FAR, NEAR], fill: { B_SCR_NAME_WITH_PREFIX2: 'Dugtrio' } },
  'effects.clamped': { args: [FAR, NEAR], fill: { B_SCR_NAME_WITH_PREFIX: 'Dugtrio' } },
  'types.changedType': withValue('B_BUFF1', 'Ice', FAR),
  'types.changedTypeWith': withValue('B_BUFF1', 'Water', FAR),
  'types.reflectedType': { args: [FAR, NEAR], fill: { B_DEF_NAME_WITH_PREFIX2: 'Dugtrio' } },
  'types.typeAdded': withValue('B_BUFF1', 'Ghost', FAR),
  'items.stole': {
    args: [NEAR, FAR, 'Leftovers'],
    fill: { B_ATK_NAME_WITH_PREFIX: 'Dugtrio', B_BUFF2: FAR_INSIDE, B_LAST_ITEM: 'Leftovers' },
  },
  'items.obtained': withValue('B_BUFF1', nb('Choice Band'), FAR),
  'items.knockedOff': {
    args: [NEAR, FAR, nb('Choice Band')],
    fill: { B_ATK_NAME_WITH_PREFIX: 'Dugtrio', B_LAST_ITEM: nb('Choice Band') },
  },
  'items.hungOn': withValue('B_LAST_ITEM', nb('Focus Sash'), FAR),
  'items.berryWeakened': withValue('B_LAST_ITEM', nb('Chople Berry'), FAR),
  'items.whiteHerb': withValue('B_LAST_ITEM', nb('White Herb'), FAR),
  'items.actsFaster': withValue('B_BUFF1', nb('Custap Berry'), FAR),
  'charge.tookTarget': { args: [FAR, NEAR], fill: { B_DEF_NAME_WITH_PREFIX2: 'Dugtrio' } },
}
