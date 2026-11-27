// A battle script's teams as the parties the park writes (#106): each side's members in party
// order, with what the log reveals of each and defaults for the rest (D6): nature Hardy, the
// species' first ability, no item. Every forme goes in as form 0 and is listed (D19); a name goes
// through the battle's font (D8). A lead whose written ability the log never shows and which acts
// as it comes in is listed with what the game shows (#109, lane plan D4). Pure: the font's
// characters and the switch-in abilities come in from build/gen5/bw2.json.
import type { BattleScript } from '../../script/events.ts'
import type { PreviewMember, Side, TeamMember } from '../../script/types.ts'
import { type Gen5Fallback, inLineOrder } from './fallbacks.ts'
import { fitName } from './font.ts'
import { baseSpecie, constantMatches, gen5, gen5Species } from './names.ts'
import type { PartyMon } from './party-mon.ts'
import { type RevealedSet, revealedSets } from './revealed.ts'
import { afterLeads } from './rules.ts'
import { partyOrder, sentIn } from './slots.ts'

/** The nature of every Pokémon: the log never shows one. */
const NATURE = 'Hardy'

/** Each side's party by Showdown's names, and what the game shows in place of what it lacks. */
export interface Teams {
  parties: Record<Side, PartyMon[]>
  fallbacks: Gen5Fallback[]
}

/** A member and where the log first shows it: its first switch-in, else Team Preview. */
interface Shown {
  readonly member: Omit<TeamMember, 'name'> & { name?: string }
  readonly set: RevealedSet
  readonly side: Side
  readonly line: number
}

/** The ability the party writes: the one the log reveals, else the species' first. */
function writtenAbility(set: RevealedSet, species: string): string {
  if (set.ability !== undefined) return set.ability
  const found = gen5.species.get(species)?.abilities[0]
  if (found === undefined) throw new Error(`no ability of the Gen 5 species ${species}`)
  return found
}

/** One Pokémon of the party with its fallbacks: a forme, and each character the font lacks. */
function partyMon({ member, set, side, line }: Shown, chars: string) {
  const { species, gender, level, shiny } = member
  const base = baseSpecie(species).name
  const { forme } = gen5Species(species)
  const name = member.name ?? base
  const fit = fitName(name, chars, { line, what: `the name of the ${side} side’s ${species}` })
  const fallbacks: Gen5Fallback[] = forme
    ? [{ line, kind: 'form', detail: `${species} shows in the base form of ${base}` }]
    : []
  const mon: PartyMon = {
    species,
    name: fit.text,
    nicknamed: name !== base,
    level,
    ...(gender === undefined ? {} : { gender }),
    shiny,
    nature: NATURE,
    ability: writtenAbility(set, species),
    ...(set.item === undefined ? {} : { item: set.item }),
    moves: set.moves,
  }
  return { mon, fallbacks: [...fallbacks, ...fit.fallbacks] }
}

/** The line of `|teampreview|`, where a member that never switches in shows. */
function previewLine(script: BattleScript, side: Side, species: string): number {
  const found = script.dropped.find((line) => line.text.startsWith('|teampreview'))
  if (found === undefined) throw new Error(`no line of the log shows the ${side} side’s ${species}`)
  return found.line
}

/** Team Preview's members that no team member matches by base species, in preview order. */
function previewOnly(script: BattleScript, side: Side): PreviewMember[] {
  const left = script.teams[side].map((member) => baseSpecie(member.species).name)
  return (script.preview?.[side] ?? []).filter((member) => {
    const at = left.indexOf(baseSpecie(member.species).name)
    if (at !== -1) left.splice(at, 1)
    return at === -1
  })
}

/** The line where each member is first sent in (`sentIn`), by team index. */
function firstSwitchIns(script: BattleScript, side: Side): Map<number, number> {
  const found = new Map<number, number>()
  for (const event of script.events) {
    const index = sentIn(event, side)
    if (index !== undefined && !found.has(index)) found.set(index, event.line)
  }
  return found
}

/** A member that never switches in, as Team Preview shows it: no nickname, not shiny. */
function unshown(script: BattleScript, side: Side, member: PreviewMember, set: RevealedSet): Shown {
  const { species, gender, level } = member
  const line = previewLine(script, side, species)
  return {
    member: { species, ...(gender ? { gender } : {}), level, shiny: false },
    set,
    side,
    line,
  }
}

/** Each member of `side` with where it first shows, in party order. */
function shownOf(script: BattleScript, side: Side, sets: readonly RevealedSet[]): Shown[] {
  const firstIn = firstSwitchIns(script, side)
  const team = partyOrder(script)[side].map((index): Shown => {
    const member = script.teams[side][index]
    if (member === undefined) throw new Error(`no ${side} team member ${String(index)}`)
    const set = sets[index] ?? { moves: [] }
    const line = firstIn.get(index)
    return line === undefined ? unshown(script, side, member, set) : { member, set, side, line }
  })
  const extra = previewOnly(script, side).map((member) =>
    unshown(script, side, member, { moves: [] }),
  )
  return [...team, ...extra]
}

/** Each side's party from a battle script, with the fallbacks of the teams in line order. */
export function partyTeams(script: BattleScript, chars: string): Teams {
  const revealed = revealedSets(script)
  const fallbacks: Gen5Fallback[] = [...revealed.fallbacks]
  const side = (of: Side) =>
    shownOf(script, of, revealed.sets[of]).map((shown) => {
      const one = partyMon(shown, chars)
      fallbacks.push(...one.fallbacks)
      return one.mon
    })
  const parties = { near: side('near'), far: side('far') }
  return { parties, fallbacks: inLineOrder(fallbacks) }
}

/** A `game` fallback for each lead whose ability the log never shows while the written one is
 * among `memberIn`, the abilities whose handlers run as their Pokémon comes in: the game runs it
 * before the first menu (BtlServerFlow_StartBattle). */
export function leadAbilityFallbacks(
  script: BattleScript,
  memberIn: readonly string[],
): Gen5Fallback[] {
  const { sets } = revealedSets(script)
  const after = afterLeads(script.events)
  return script.events.flatMap((event, i): Gen5Fallback[] => {
    if (event.kind !== 'switchIn' || after[i] === true) return []
    const set = sets[event.who.side][event.who.index] ?? { moves: [] }
    const species = script.teams[event.who.side][event.who.index]?.species ?? ''
    const ability = writtenAbility(set, species)
    if (set.ability !== undefined || !memberIn.some((one) => constantMatches(one, ability))) {
      return []
    }
    const detail = `Black 2 shows the ${ability} of the ${event.who.side} side’s ${species} as it comes in`
    return [{ line: event.line, kind: 'game', detail }]
  })
}
