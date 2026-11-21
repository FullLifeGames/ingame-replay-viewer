import type { Protocol } from '@pkmn/protocol'

import type { LogLine } from './lines'
import type { DropReason } from './types'

type NamedPlayerArgs = Extract<Protocol.Args['|player|'], { length: 5 }>

// Lines the game never shows, by protocol key. `||`, `|player|` and the failing reasons
// (`unknown`, `unsupported`) need more than the key and are decided below or in the build.
const REASONS: Partial<Record<Protocol.ArgName, DropReason>> = {
  '|done|': 'spacer',
  '|t:|': 'timestamp',
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
  '|upkeep|': 'upkeep',
  '|raw|': 'room',
  '|html|': 'room',
  '|uhtml|': 'room',
  '|uhtmlchange|': 'room',
  '|-hint|': 'hint',
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
  return line.key && REASONS[line.key]
}
