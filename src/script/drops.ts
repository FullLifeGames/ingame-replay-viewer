import { toID } from '@pkmn/dex'
import type { Protocol } from '@pkmn/protocol'

import type { LogLine } from './lines'
import { effectOf } from './refs'
import type { DropReason } from './types'

type NamedPlayerArgs = Extract<Protocol.Args['|player|'], { length: 5 }>

// Lines the game never shows, by protocol key. `||`, `|player|` and the failing reasons
// (`unknown`, `unsupported`) need more than the key and are decided below or in the build.
const REASONS: Partial<Record<Protocol.ArgName, DropReason>> = {
  '|done|': 'spacer',
  '|t:|': 'timestamp',
  '|:|': 'timestamp',
  '|chat|': 'chat',
  '|c:|': 'chat',
  '|join|': 'chat',
  '|leave|': 'chat',
  '|name|': 'chat',
  '|inactive|': 'timer',
  '|inactiveoff|': 'timer',
  '|rule|': 'rule',
  '|gametype|': 'metadata',
  '|gen|': 'metadata',
  '|tier|': 'metadata',
  '|rated|': 'metadata',
  '|seed|': 'metadata',
  '|badge|': 'metadata',
  '|upkeep|': 'upkeep',
  '|raw|': 'room',
  '|html|': 'room',
  '|uhtml|': 'room',
  '|uhtmlchange|': 'room',
  '|error|': 'room',
  '|bigerror|': 'room',
  '|chatmsg|': 'room',
  '|chatmsg-raw|': 'room',
  '|hidelines|': 'room',
  '|unlink|': 'room',
  '|notify|': 'room',
  '|warning|': 'room',
  '|-hint|': 'hint',
  '|debug|': 'debug',
  // Team Preview, which a format can add as a rule: the intro's balls show each team, and the
  // page lists both teams from the script's `preview` (#87).
  '|clearpoke|': 'preview',
  '|poke|': 'preview',
  '|teampreview|': 'preview',
  '|updatepoke|': 'preview',
  '|custom|': 'format',
  // The client keeps the volatile; the next turn's `|cant|…|recharge` says it.
  '|-mustrecharge|': 'state',
}

/**
 * The one-turn effects whose `|-singleturn|` line the game never shows, by the effect's id. Roost
 * alone: its heal line says the move, the client keeps the volatile, and the game prints nothing
 * for the turn without its Flying type. A set of names, since @pkmn's data tells no effect the
 * game says from one it keeps silent.
 */
const STATE_SINGLE_TURNS: ReadonlySet<string> = new Set(['roost'])

/** Whether `line` is a one-turn effect the game keeps silent, such as Roost's. */
function isStateSingleTurn({ key, args: [, , effect] }: LogLine): boolean {
  if (key !== '|-singleturn|' || typeof effect !== 'string') return false
  return STATE_SINGLE_TURNS.has(toID(effectOf(effect).name))
}

/** A `|player|` line that names its player, as the intro shows it. */
export function isNamedPlayer(args: Protocol.ArgType): args is NamedPlayerArgs {
  return args[0] === 'player' && typeof args[2] === 'string' && args[2] !== ''
}

/**
 * The reason a known line is a dropped line, or undefined for a line a rule shows. `started`
 * tells whether `|start` has passed: a player line after it is a reconnect, not the intro.
 */
export function dropReasonOf(line: LogLine, started: boolean): DropReason | undefined {
  if (line.key === '||') {
    return line.text === '' ? 'spacer' : 'room'
  }
  if (line.key === '|player|') {
    return started || !isNamedPlayer(line.args) ? 'room' : undefined
  }
  if (isStateSingleTurn(line)) {
    return 'state'
  }
  return line.key && dropReasonOfKind(line.key)
}

/** Why every line of a kind is a dropped line, or undefined when the kind alone does not say. */
export function dropReasonOfKind(key: Protocol.ArgName): DropReason | undefined {
  return REASONS[key]
}
