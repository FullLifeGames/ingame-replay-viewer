// Samples for the devbox phrase spec (P2, `gen3-phrases.test.ts`): the arguments each tagged
// template takes and the values the pinned string's placeholders take in the same scene. The
// spec renders both and holds them equal. A template that takes one Pokémon and no other value
// needs no sample: it gets the far Pokémon, which every Pokémon placeholder names by default.
import type { Mon } from '../src/gen3/text/names.ts'
import type { AnyTemplate } from '../src/gen3/text/template.ts'
import { EFFECT_TEMPLATES } from '../src/gen3/text/phrases-effects.ts'
import { FIELD_TEMPLATES } from '../src/gen3/text/phrases-field.ts'
import { HP_TEMPLATES } from '../src/gen3/text/phrases-hp.ts'
import { ITEM_TEMPLATES } from '../src/gen3/text/phrases-items.ts'
import { CANT_TEMPLATES, STATUS_TEMPLATES } from '../src/gen3/text/phrases-status.ts'
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
  items: ITEM_TEMPLATES,
}

const withValue = (placeholder: string, value: string, ...before: unknown[]): Sample => ({
  args: [...before, value],
  fill: { [placeholder]: value },
})

const lumBerry = withValue('B_LAST_ITEM', nb('Lum Berry'), FAR)
const rockSlide = withValue('B_CURRENT_MOVE', nb('Rock Slide'), FAR)

export const SAMPLES: Readonly<Record<string, Sample>> = {
  'moves.usedMove': withValue('B_BUFF3', nb('Rock Slide'), FAR),
  'stats.rose': {
    args: [FAR, nb('Sp. Atk'), nb(' sharply')],
    fill: { B_BUFF1: nb('Sp. Atk'), B_BUFF2: nb(' sharply') },
  },
  'stats.fell': {
    args: [FAR, 'Attack', nb('harshly ')],
    fill: { B_BUFF1: 'Attack', B_BUFF2: nb('harshly ') },
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
  'field.reflect': { args: [FOES_INSIDE] },
  'field.lightScreen': { args: [FOES_INSIDE] },
  'field.safeguard': { args: [FOES] },
  'field.reflectGone': { args: [FOES] },
  'field.lightScreenGone': { args: [FOES] },
  'field.safeguardGone': { args: [FOES] },
  'field.woreOff': withValue('B_BUFF1', nb('Light Screen'), FOES),
  'effects.perish': withValue('B_BUFF1', '3', FAR),
  'effects.cursed': { args: [NEAR, FAR], fill: { B_ATK_NAME_WITH_PREFIX: 'Dugtrio' } },
  'effects.freed': withValue('B_BUFF1', nb('Fire Spin'), FAR),
  'items.stole': {
    args: [NEAR, FAR, 'Leftovers'],
    fill: { B_ATK_NAME_WITH_PREFIX: 'Dugtrio', B_BUFF2: FAR_INSIDE, B_LAST_ITEM: 'Leftovers' },
  },
  'items.obtained': withValue('B_BUFF1', nb('Choice Band'), FAR),
  'items.knockedOff': {
    args: [NEAR, FAR, nb('Choice Band')],
    fill: { B_ATK_NAME_WITH_PREFIX: 'Dugtrio', B_LAST_ITEM: nb('Choice Band') },
  },
}
