// The labels of the battle's text banks (#107), from pokebw2 at its pin: the standard bank, whose
// lines go out as SC_MSG_STD, and the set bank, whose lines go out as SC_MSG_SET (the bank order
// in btl_string.c). Each line of a bank is `<label> = <text>`, the game finds a line by its index,
// and each bank ends in a `\pad{…}` line. Part of build/gen5/bw2.json as each label's index; the
// errors name the bank's role and labels, and show no index and no text of the game.
import type { TextNumbers } from '../src/gen5/bw2-numbers.ts'

/** The two banks, by role. */
export const TEXT_SOURCES = {
  standardBank: 'res/text/system/0019.txt',
  setBank: 'res/text/system/0018.txt',
}

/** The texts of TEXT_SOURCES by role. */
export type TextInput = Record<keyof typeof TEXT_SOURCES, string>

const LABELLED = /^(Bank\d{4}_Text_\w+) = /
const PAD = /^\\pad\{\d+\}$/

/** The lines of a bank's text, without the empty one after its last newline and without its pad
 * line at the end. */
function bankLines(bank: string): string[] {
  const lines = bank.split('\n')
  if (lines.at(-1) === '') lines.pop()
  if (PAD.test(lines.at(-1) ?? '')) lines.pop()
  return lines
}

/** Each label of a bank with its line's index; throws by `name` on a line of another shape, which
 * it names by the label before it, and on a repeated label. The game's text stays out of an
 * error, as CI's log is public. */
export function textLabels(bank: string, name: string): Record<string, number> {
  const labels: Record<string, number> = {}
  let last: string | undefined
  for (const [index, line] of bankLines(bank).entries()) {
    const label = LABELLED.exec(line)?.[1]
    if (label === undefined) {
      const where = last === undefined ? 'the first line' : `the line after ${last}`
      throw new Error(`${name}: cannot read ${where}`)
    }
    if (Object.hasOwn(labels, label)) throw new Error(`${name}: the label ${label} stands twice`)
    labels[label] = index
    last = label
  }
  return labels
}

/** The labels of the standard and the set bank. */
export const textNumbers = (input: TextInput): TextNumbers => ({
  standard: textLabels(input.standardBank, 'standard'),
  set: textLabels(input.setBank, 'set'),
})
