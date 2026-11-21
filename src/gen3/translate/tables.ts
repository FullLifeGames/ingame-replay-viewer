// The header's trainer and party tables (plan §2) from what the walk learnt: the players, their
// team sizes and the revealed team members.
import type { Side, TeamMember } from '../../script/types'
import { Gen3Error } from '../errors'
import { STREAM } from '../stream/format'
import type { Party, Stream, StreamMon, StreamTrainer } from '../stream/instructions'
import { speciesOf } from '../tables/lookup'
import trainerPics from '../tables/trainer-pics.json'
import type { Context } from './context'
import { HP_SCALE } from './scale'

/** D9: fixed trainer pics in M1, Showdown avatars come later. */
const PICS: Readonly<Record<Side, number>> = {
  near: trainerPics.TRAINER_PIC_BRENDAN,
  far: trainerPics.TRAINER_PIC_MAY,
}

const GENDERS = { M: 'male', F: 'female' } as const

export function tablesOf(ctx: Context): Omit<Stream, 'instructions'> {
  return {
    trainers: { near: trainerOf(ctx, 'near'), far: trainerOf(ctx, 'far') },
    parties: { near: partyOf(ctx, 'near'), far: partyOf(ctx, 'far') },
  }
}

function trainerOf(ctx: Context, side: Side): StreamTrainer {
  const revealed = ctx.script.teams[side].length
  return {
    name: ctx.player(side).header,
    trainerPic: PICS[side],
    teamSize: ctx.teamSizes[side] ?? revealed,
    revealed,
  }
}

function partyOf(ctx: Context, side: Side): Party {
  const team = ctx.script.teams[side]
  if (team.length > STREAM.partySize) {
    throw new Gen3Error(
      `the ${side} side reveals ${String(team.length)} Pokémon, a party holds ${String(STREAM.partySize)}`,
    )
  }
  const mons = team.map((member, index) => monOf(ctx, side, index, member))
  return [...mons, ...Array.from({ length: STREAM.partySize - mons.length }, () => null)]
}

function monOf(ctx: Context, side: Side, index: number, member: TeamMember): StreamMon {
  const species = speciesOf(member.species)
  const { nickname } = ctx.member({ side, index })
  ctx.note(ctx.firstLine({ side, index }), species.fallback)
  return {
    species: species.number,
    maxHp: HP_SCALE,
    level: member.level,
    gender: member.gender === undefined ? 'none' : GENDERS[member.gender],
    shiny: member.shiny,
    nickname,
  }
}
