// The build loop: battle log in, battle script out (plan "No silent drops"). Every line becomes
// events or a dropped line; nothing is skipped.

import type { Battle, Pokemon } from '@pkmn/client'
import type { Protocol } from '@pkmn/protocol'

import { newBattle } from './client'
import { dropReasonOf } from './drops'
import { ScriptError } from './errors'
import { readLines } from './lines'
import type { LogLine } from './lines'
import { eventsOf, ruleFor, unreadPart } from './rules/index'
import type { Before } from './rules/index'
import type { BattleScript, ScriptEvent } from './events'
import type { DroppedLine, DropReason, TeamMember } from './types'

interface Build {
  readonly battle: Battle
  readonly events: ScriptEvent[]
  readonly dropped: DroppedLine[]
  started: boolean
}

function drop(build: Build, line: LogLine, reason: DropReason, detail?: string): void {
  const { index, text } = line
  build.dropped.push({ line: index, text, reason, ...(detail === undefined ? {} : { detail }) })
}

function refuseGameType(line: LogLine): void {
  const [, gameType] = line.args as Protocol.Args['|gametype|']
  if (line.key === '|gametype|' && gameType !== 'singles') {
    throw new ScriptError(line.index, `the game type "${gameType}" is not singles`)
  }
}

function beforeOf(battle: Battle): Before {
  return { active: { near: battle.p1.active[0] ?? null, far: battle.p2.active[0] ?? null } }
}

function addToClient(battle: Battle, line: LogLine): void {
  try {
    battle.add(line.args, line.kwArgs)
  } catch (error) {
    throw new ScriptError(line.index, `the client cannot follow "${line.text}"`, { cause: error })
  }
}

function readLine(build: Build, line: LogLine): void {
  if (line.key === undefined) {
    drop(build, line, 'unknown')
    return
  }
  refuseGameType(line)
  const before = beforeOf(build.battle)
  addToClient(build.battle, line)
  const reason = dropReasonOf(line, build.started)
  build.started ||= line.key === '|start|'
  const rule = ruleFor(line.key)
  if (reason !== undefined || rule === undefined) {
    drop(build, line, reason ?? 'unsupported', reason ? undefined : `no rule for ${line.key}`)
    return
  }
  const unread = unreadPart(rule, line)
  if (unread !== undefined) {
    drop(build, line, 'unsupported', unread)
    return
  }
  build.events.push(...eventsOf(rule, line, build.battle, before))
}

function memberOf(pokemon: Pokemon): TeamMember {
  const { speciesForme: species, name, gender, level, shiny } = pokemon
  return { species, name, ...(gender === 'M' || gender === 'F' ? { gender } : {}), level, shiny }
}

/** Turns a battle log into its battle script. Throws a ScriptError the script cannot follow. */
export function buildBattleScript(log: string): BattleScript {
  const build: Build = { battle: newBattle(), events: [], dropped: [], started: false }
  for (const line of readLines(log)) {
    readLine(build, line)
  }
  const { battle, events, dropped } = build
  return {
    gen: battle.gen.num,
    format: battle.tier,
    teams: { near: battle.p1.team.map(memberOf), far: battle.p2.team.map(memberOf) },
    events,
    dropped,
  }
}
