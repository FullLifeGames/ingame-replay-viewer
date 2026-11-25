// The team list's words (#87): both teams of Team Preview under the game, each side under the
// panel's heading for it, the far side first as the game shows it at the top. The view writes
// them as text, never as markup: the names come from other people's replays.
import type { PreviewMember, Side } from '../script/types'
import type { ReplaySummary } from './replay-choice'
import { sideLine } from './status'

/** One side's column: its heading and one line per Pokémon, in the log's order. */
export interface TeamList {
  readonly heading: string
  readonly members: readonly string[]
}

/** The columns' order: the far side first, as the game shows it at the top. */
export const TEAM_SIDES: readonly Side[] = ['far', 'near']
const SIGNS = { M: '♂', F: '♀' } as const
/** The level a battle shows no level for; Showdown's details leave it out too. */
const FULL_LEVEL = 100

/** "Zoroark ♀ Lv. 50": the species, its sign when the log gives one, its level below 100. */
function memberText({ species, gender, level }: PreviewMember): string {
  const sign = gender === undefined ? '' : ` ${SIGNS[gender]}`
  const shownLevel = level < FULL_LEVEL ? ` Lv. ${String(level)}` : ''
  return `${species}${sign}${shownLevel}`
}

/** Both columns, far side first; none for a replay without Team Preview. */
export function teamLists({
  players,
  preview,
}: Pick<ReplaySummary, 'players' | 'preview'>): readonly TeamList[] | undefined {
  if (preview === undefined) return undefined
  return TEAM_SIDES.map((side) => ({
    heading: sideLine(side, players[side]),
    members: preview[side].map(memberText),
  }))
}
