import { Protocol } from '@pkmn/protocol'

/** One line of a battle log, parsed by @pkmn/protocol, with its index into the log. */
export interface LogLine {
  /** 0-based index into `log.split('\n')`; every event and dropped line points back here. */
  readonly index: number
  readonly text: string
  /** `'|move|'` and friends; undefined for a name outside the protocol. */
  readonly key: Protocol.ArgName | undefined
  readonly args: Protocol.ArgType
  readonly kwArgs: Protocol.BattleArgsKWArgType
}

/**
 * The number a person reads for the line at 0-based `index`: battle log lines count from 1 in
 * every message and on every page. Data keeps the index.
 */
export const lineNumber = (index: number): number => index + 1

/**
 * Splits a battle log into its lines. `Protocol.parse` skips empty lines and so loses the
 * indices; this keeps every line. The empty string after a final newline is not a line.
 */
export function readLines(log: string): LogLine[] {
  const texts = log.split('\n')
  if (texts.at(-1) === '') {
    texts.pop()
  }
  return texts.map((text, index) => {
    const { args, kwArgs } = Protocol.parseBattleLine(text)
    return { index, text, key: Protocol.key(args), args, kwArgs }
  })
}
