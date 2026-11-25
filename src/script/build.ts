// The build loop: battle log in, battle script out (plan "No silent drops"). Every line becomes
// events or a dropped line; nothing is skipped.

import type { Battle, Pokemon } from '@pkmn/client'
import type { Protocol } from '@pkmn/protocol'

import { noRuleReason } from './census'
import { newBattle } from './client'
import { dropReasonOf } from './drops'
import { GameTypeRefusal, ScriptError } from './errors'
import { HitFolder } from './hits'
import { readLines } from './lines'
import { genderOf, previewOf } from './preview'
import { bySide } from './refs'
import type { LogLine } from './lines'
import { eventsOf, ruleFor, unreadPart } from './rules/index'
import type { Before } from './rules/index'
import type { BattleScript, ScriptEvent } from './events'
import type { DroppedLine, DropReason, Preview, Side, TeamMember } from './types'

interface Build {
  readonly battle: Battle
  readonly events: ScriptEvent[]
  readonly dropped: DroppedLine[]
  readonly hits: HitFolder
  readonly players: Partial<Record<Side, string>>
  started: boolean
  /** The teams as `|teampreview|` left them, for the page's list (#87). */
  preview?: Preview
}

function drop(build: Build, line: LogLine, reason: DropReason, detail?: string): void {
  const { index, text } = line
  build.dropped.push({ line: index, text, reason, ...(detail === undefined ? {} : { detail }) })
}

function refuseGameType(line: LogLine): void {
  const [, gameType] = line.args as Protocol.Args['|gametype|']
  if (line.key === '|gametype|' && gameType !== 'singles') {
    throw new GameTypeRefusal(line.index, gameType)
  }
}

function beforeOf({ battle, players }: Build): Before {
  const active = bySide(battle, (side) => side.active[0] ?? null)
  const boosts = bySide(battle, (side) => ({ ...side.active[0]?.boosts }))
  return { active, boosts, weather: battle.field.weather, players: { ...players } }
}

/** Keeps the names the intro shows, for the win to match against. */
function notePlayers(build: Build, events: readonly ScriptEvent[]): void {
  for (const event of events) {
    if (event.kind === 'player') {
      build.players[event.side] = event.name
    }
  }
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
  const before = beforeOf(build)
  addToClient(build.battle, line)
  if (line.key === '|teampreview|') build.preview = previewOf(build.battle)
  const reason = dropReasonOf(line, build.started)
  build.started ||= line.key === '|start|'
  const rule = ruleFor(line.key)
  if (reason !== undefined || rule === undefined) {
    drop(build, line, reason ?? 'unsupported', reason ? undefined : noRuleReason(line.key))
    return
  }
  const unread = unreadPart(rule, line)
  if (unread !== undefined) {
    drop(build, line, 'unsupported', unread)
    return
  }
  const events = eventsOf(rule, line, build.battle, before)
  notePlayers(build, events)
  build.events.push(...build.hits.pass(events))
}

/**
 * A team member as its switch line shows it. `baseSpeciesForme` is that species; the client's
 * `speciesForme` is the form of a form change or Transform while it lasts.
 */
function memberOf(pokemon: Pokemon): TeamMember {
  const { baseSpeciesForme: species, name, level, shiny } = pokemon
  return { species, name, ...genderOf(pokemon), level, shiny }
}

/** Turns a battle log into its battle script. Throws a ScriptError the script cannot follow. */
export function buildBattleScript(log: string): BattleScript {
  const hits = new HitFolder()
  const build: Build = {
    battle: newBattle(),
    events: [],
    dropped: [],
    hits,
    players: {},
    started: false,
  }
  for (const line of readLines(log)) {
    readLine(build, line)
  }
  const { battle, events, dropped, preview } = build
  events.push(...hits.flush())
  return {
    gen: battle.gen.num,
    format: battle.tier,
    teams: bySide(battle, (side) => side.team.map(memberOf)),
    ...(preview === undefined ? {} : { preview }),
    events,
    dropped,
  }
}
