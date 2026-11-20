// Helpers for the battle script's specs: the test replays and short battle logs around them.

import { buildBattleScript } from './build'
import type { BattleScript, ScriptEvent } from './events'
import { readReplay } from './replay'
import type { PokemonRef, Side } from './types'

const DIR = '../../test/fixtures/replays/'

const files = import.meta.glob('../../test/fixtures/replays/*.json', {
  eager: true,
  import: 'default',
})

/** The test replays from #2, by id. */
export const REPLAYS = Object.entries(files).map(([path, json]) => {
  const { log } = readReplay(json)
  return { id: path.slice(DIR.length, -'.json'.length), log }
})

/** The battle log of a test replay. */
export function logOf(id: string): string {
  const replay = REPLAYS.find((candidate) => candidate.id === id)
  if (replay === undefined) {
    throw new Error(`no test replay ${id}`)
  }
  return replay.log
}

const INTRO = [
  '|gen|3',
  '|player|p1|Alice|1|',
  '|player|p2|Bob|2|',
  '|teamsize|p1|6',
  '|teamsize|p2|6',
]
const LEADS = [
  '|start',
  '|switch|p1a: Dugtrio|Dugtrio, M|100/100',
  '|switch|p2a: Tyranitar|Tyranitar, M|100/100',
]

/** The index of the first line after the intro and the two leads of `scriptOf`. */
export const NEXT = INTRO.length + LEADS.length

/** The battle script of a short log: Alice's Dugtrio meets Bob's Tyranitar, then `lines`. */
export function scriptOf(...lines: string[]): BattleScript {
  return buildBattleScript(`${[...INTRO, ...LEADS, ...lines].join('\n')}\n`)
}

/** The events of `script` from the given lines on. */
export function eventsFrom(script: BattleScript, line: number): ScriptEvent[] {
  return script.events.filter((event) => event.line >= line)
}

/** The events of one log line. */
export function eventsAt(script: BattleScript, line: number): ScriptEvent[] {
  return script.events.filter((event) => event.line === line)
}

/** The team member of `side` with the given name, as a reference. */
export function refIn(script: BattleScript, side: Side, name: string): PokemonRef {
  const index = script.teams[side].findIndex((member) => member.name === name)
  if (index === -1) {
    throw new Error(`no ${name} on the ${side} side`)
  }
  return { side, index }
}
