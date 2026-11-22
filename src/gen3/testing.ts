// Spec helpers for the Gen 3 game backend: the instruction stream of a short battle log.
import type { Side } from '../script/types'
import { NEXT, scriptOf } from '../script/testing'
import { buildGen3Stream, type Gen3Stream } from './backend'
import type { Instruction } from './stream/instructions'
import { abilityOf } from './tables/lookup'

/** The game backend's output for Alice's Dugtrio against Bob's Tyranitar, then `lines`. */
export const streamOfLog = (...lines: string[]): Gen3Stream => buildGen3Stream(scriptOf(...lines))

/**
 * The instructions that `lines` give after the intro and the leads, without the END that closes
 * a log with no result.
 */
export function sceneOf(...lines: string[]): Instruction[] {
  return streamOfLog(...lines)
    .instructions.filter(({ line, instruction }) => line >= NEXT && instruction.op !== 'end')
    .map(({ instruction }) => instruction)
}

/** The text of a PRINT, as a spec writes it with plain spaces. */
export const plain = (instruction: Instruction) =>
  instruction.op === 'print' ? instruction.text.replaceAll(' ', ' ') : instruction

/** The ABILITY op that raises (`show`) or lowers the pop-up of `name` on `side`. */
export const popUp = (side: Side, name: string, show: boolean) => ({
  op: 'ability',
  side,
  ability: abilityOf(name).number,
  show,
})
