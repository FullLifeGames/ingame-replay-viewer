// The rules between the team tables and the instructions, as the ROM's validator holds them
// (ValidateTeams, ValidateOperands): the near trainer pic has a back pic and the far one a front
// pic, each side's party holds a mon, and an operand that names a party slot names one that holds
// a mon. The encoder and the decoder both check them here.
import type { Side } from '../../script/types'
import { Gen3Error } from '../errors'
import { DRAWN_VIEW, fitsSide } from '../tables/avatars'
import { SIDE } from './format'
import type { Stream } from './instructions'

export function checkTeams({ trainers, parties, instructions }: Stream): void {
  for (const side of Object.keys(SIDE) as Side[]) {
    const pic = trainers[side].trainerPic
    if (!fitsSide(side, pic)) {
      throw new Gen3Error(`the ${side} trainer pic ${String(pic)} has no ${DRAWN_VIEW[side]} pic`)
    }
    if (parties[side].every((mon) => mon === null)) {
      throw new Gen3Error(`the ${side} party holds no mon`)
    }
  }
  for (const instruction of instructions) {
    if ('slot' in instruction && (parties[instruction.side][instruction.slot] ?? null) === null) {
      const { op, side, slot } = instruction
      throw new Gen3Error(`${op} names ${side} slot ${String(slot)}, which holds no mon`)
    }
  }
}
