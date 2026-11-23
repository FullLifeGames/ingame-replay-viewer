// Names in battle text (plan §5, D1, D6, D7). The game inserts every name with no-break spaces, so
// a name never breaks across lines, and puts "The opposing " before a far Pokémon.
import type { Side, TeamMember } from '../../script/types'
import { MON } from '../stream/format'
import { abilityOf, itemOf, moveOf, speciesOf } from '../tables/lookup'
import { type CharacterFallback, type Fitted, fitCharset } from './charset'
import { tagged } from './template'

/** A Pokémon as text sees it: its side and its name, words held together. */
export interface Mon {
  readonly side: Side
  readonly name: string
}

export interface NamedMon {
  readonly mon: Mon
  /** The party nickname: the first 12 glyphs, plain spaces (D6). */
  readonly nickname: string
  readonly fallback?: CharacterFallback
}

const NICKNAME_GLYPHS = MON.nicknameLength - 1

/** A word the game inserts gets no-break spaces for its spaces (`battle_message.c`). */
export const held = (text: string) => text.replaceAll(' ', '\u00a0')

export const NAME_TEMPLATES = {
  foePrefix: tagged('sText_FoePkmnPrefix', () => 'The opposing '),
  foePrefixInside: tagged('sText_FoePkmnPrefixLower', () => 'the opposing '),
  yourTeam: tagged('sText_Your1', () => 'Your'),
  yourTeamInside: tagged('sText_Your2', () => 'your'),
  foeTeam: tagged('sText_Opposing1', () => 'The opposing'),
  foeTeamInside: tagged('sText_Opposing2', () => 'the opposing'),
}

/** A team member's name; one without a nickname shows the expansion's display name (N2). */
export function nameMon(side: Side, member: TeamMember): NamedMon {
  const shown = member.name === member.species ? speciesOf(member.species).name : member.name
  const { text, fallback } = fitCharset(shown)
  const nickname = Array.from(text).slice(0, NICKNAME_GLYPHS).join('')
  const mon = { side, name: held(text) }
  return fallback === undefined ? { mon, nickname } : { mon, nickname, fallback }
}

export function nameAtStart(mon: Mon): string {
  return mon.side === 'far' ? NAME_TEMPLATES.foePrefix.render() + mon.name : mon.name
}

/** The name with the game's "'s" at a sentence start: "The opposing Skarmory's". */
export const ownerAtStart = (mon: Mon) => `${nameAtStart(mon)}'s`

export function nameInside(mon: Mon): string {
  return mon.side === 'far' ? NAME_TEMPLATES.foePrefixInside.render() + mon.name : mon.name
}

/** "Your" or "The opposing", as in "Your side's Reflect wore off!". */
export function teamAtStart(side: Side): string {
  return held((side === 'far' ? NAME_TEMPLATES.foeTeam : NAME_TEMPLATES.yourTeam).render())
}

export function teamInside(side: Side): string {
  const template = side === 'far' ? NAME_TEMPLATES.foeTeamInside : NAME_TEMPLATES.yourTeamInside
  return held(template.render())
}

/** A player's name for text, fitted to the charset. */
export function nameTrainer(name: string): Fitted {
  const { text, fallback } = fitCharset(name)
  return fallback === undefined ? { text: held(text) } : { text: held(text), fallback }
}

export const speciesName = (name: string) => held(speciesOf(name).name)
export const moveName = (name: string) => held(moveOf(name).name)
export const itemName = (name: string) => held(itemOf(name).name)
export const abilityName = (name: string) => held(abilityOf(name).name)
