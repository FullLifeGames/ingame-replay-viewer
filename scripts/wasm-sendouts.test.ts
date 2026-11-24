import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { decodeStream } from '../src/gen3/stream/decode.ts'
import { encodeStream } from '../src/gen3/stream/encode.ts'
import speciesTable from '../src/gen3/tables/species.json'
import trainerPics from '../src/gen3/tables/trainer-pics.json'
import { readerTree } from './rom-paths.ts'
import {
  readSendOutAnimations,
  SEND_OUTS,
  sendOutCoverage,
  sendOutStreams,
} from './wasm-sendouts.ts'
import type { SendOutStream } from './wasm-sendouts.ts'

const ANIMATION_C = `static void (*const sMonAnimFunctions[])(struct Sprite *sprite) =
{
    [ANIM_V_SQUISH_AND_BOUNCE]  = Anim_VerticalSquishBounce,
    [ANIM_H_SLIDE]              = Anim_HorizontalSlide,
    [ANIM_V_SLIDE]              = Anim_VerticalSlide,
    [ANIM_ROTATE_TO_SIDES]      = Anim_RotateToSides, // Unused
    [ANIM_GROW]                 = Anim_Grow,
    [ANIM_H_SLIDE_FAST]         = Anim_HorizontalSlide_Fast,
    [ANIM_H_SLIDE_SLOW]         = Anim_HorizontalSlide_Slow,
    [ANIM_V_SHAKE]              = Anim_VerticalShake,
    [ANIM_V_SHAKE_FAST]         = Anim_VerticalShake_Fast,
    [ANIM_V_SHAKE_SLOW]         = Anim_VerticalShake_Slow,
};

static const u8 sBackAnimationIds[] =
{
    [(BACK_ANIM_H_SLIDE - 1) * 3] = ANIM_H_SLIDE_FAST, ANIM_H_SLIDE, ANIM_H_SLIDE_SLOW,
    [(BACK_ANIM_V_SHAKE - 1) * 3] = ANIM_V_SHAKE_FAST, ANIM_V_SHAKE, ANIM_V_SHAKE_SLOW,
};
`

const CONFIG = (gba: string) =>
  `#define P_GBA_STYLE_SPECIES_GFX         ${gba}       // GBA-style sprites\n`

const SPECIES_INFO = '#include "species_info/gen_1_families.h"\n'

// Six front animations (Epsilon's goes to Early, the lower number) and two back sets.
const FAMILIES = `#define FORM_INFO(x) { .frontAnimId = ANIM_GROW, .backAnimId = BACK_ANIM_V_SHAKE, }
    [SPECIES_NONE] = { .frontAnimId = ANIM_V_SQUISH_AND_BOUNCE, .backAnimId = BACK_ANIM_NONE, },
    [SPECIES_A] = { .frontAnimId = ANIM_H_SLIDE, .backAnimId = BACK_ANIM_H_SLIDE, },
    [SPECIES_B] = { .frontAnimId = P_GBA_STYLE_SPECIES_GFX ? ANIM_H_SLIDE : ANIM_V_SLIDE, },
    [SPECIES_C] = { .frontAnimId = ANIM_V_SQUISH_AND_BOUNCE, .backAnimId = BACK_ANIM_NONE, },
    [SPECIES_D] = FORM_INFO(D),
    [SPECIES_E] = { .frontAnimId = ANIM_V_SHAKE, },
    [SPECIES_F] = { .frontAnimId = ANIM_H_SLIDE_FAST, },
    [SPECIES_H] = { .frontAnimId = ANIM_V_SLIDE, },
    [SPECIES_EARLY] = { .frontAnimId = ANIM_V_SHAKE, },
`

const SPECIES: Record<string, readonly [number, string]> = {
  SPECIES_NONE: [0, '??????????'],
  SPECIES_EARLY: [1, 'Early'],
  SPECIES_A: [2, 'Alpha'],
  SPECIES_B: [3, 'Beta'],
  SPECIES_C: [4, 'Gamma'],
  SPECIES_D: [5, 'Delta'],
  SPECIES_E: [6, 'Epsilon'],
  SPECIES_F: [7, 'Zeta'],
  SPECIES_G: [8, 'Eta'],
  SPECIES_H: [9, 'Theta'],
}

const PICS = { near: trainerPics.TRAINER_PIC_BRENDAN, far: trainerPics.TRAINER_PIC_MAY }

function smallTree(gba = 'FALSE') {
  const files: Record<string, string> = {
    'src/pokemon_animation.c': ANIMATION_C,
    'include/config/pokemon.h': CONFIG(gba),
    'src/data/pokemon/species_info.h': SPECIES_INFO,
    'src/data/pokemon/species_info/gen_1_families.h': FAMILIES,
  }
  return (path: string) => {
    const text = files[path]
    if (text === undefined) throw new Error(`no ${path} in the small tree`)
    return text
  }
}

const sentOut = (streams: readonly SendOutStream[], side: 'near' | 'far') =>
  streams.flatMap(({ stream }) =>
    stream.instructions.flatMap((instruction) =>
      (instruction.op === 'sendOut' || instruction.op === 'switchIn') && instruction.side === side
        ? [stream.parties[side][instruction.slot]?.nickname]
        : [],
    ),
  )

describe('readSendOutAnimations', () => {
  it('reads the functions, the back sets and each species with the config branch it takes', () => {
    const anims = readSendOutAnimations(smallTree())
    expect(anims.functions).toEqual([
      'ANIM_V_SQUISH_AND_BOUNCE',
      'ANIM_H_SLIDE',
      'ANIM_V_SLIDE',
      'ANIM_ROTATE_TO_SIDES',
      'ANIM_GROW',
      'ANIM_H_SLIDE_FAST',
      'ANIM_H_SLIDE_SLOW',
      'ANIM_V_SHAKE',
      'ANIM_V_SHAKE_FAST',
      'ANIM_V_SHAKE_SLOW',
    ])
    expect(Object.fromEntries(anims.backSets)).toEqual({
      BACK_ANIM_H_SLIDE: ['ANIM_H_SLIDE_FAST', 'ANIM_H_SLIDE', 'ANIM_H_SLIDE_SLOW'],
      BACK_ANIM_V_SHAKE: ['ANIM_V_SHAKE_FAST', 'ANIM_V_SHAKE', 'ANIM_V_SHAKE_SLOW'],
    })
    expect(anims.front.get('SPECIES_B')).toBe('ANIM_V_SLIDE')
    expect(anims.front.get('SPECIES_D')).toBe('ANIM_GROW')
    expect(anims.back.get('SPECIES_D')).toBe('BACK_ANIM_V_SHAKE')
    expect(anims.back.has('SPECIES_B')).toBe(false)
    expect(readSendOutAnimations(smallTree('TRUE')).front.get('SPECIES_B')).toBe('ANIM_H_SLIDE')
  })

  it('fails on a value it cannot read', () => {
    const read = smallTree()
    const odd = (path: string) =>
      path.endsWith('gen_1_families.h') ? '[SPECIES_A] = { .frontAnimId = anim, },\n' : read(path)
    expect(() => readSendOutAnimations(odd)).toThrow(/SPECIES_A: frontAnimId "anim"/)
    const unknown = (path: string) =>
      path.endsWith('gen_1_families.h')
        ? '[SPECIES_A] = { .frontAnimId = P_OTHER ? ANIM_GROW : ANIM_H_SLIDE, },\n'
        : read(path)
    expect(() => readSendOutAnimations(unknown)).toThrow(/P_OTHER is no TRUE or FALSE/)
  })
})

describe('sendOutStreams', () => {
  const anims = readSendOutAnimations(smallTree())
  const streams = sendOutStreams(anims, SPECIES, PICS)

  it('sends out the lowest-numbered species of each front animation far and of each back set near', () => {
    expect(streams.map((stream) => stream.name)).toEqual([`${SEND_OUTS}-1`])
    expect(sentOut(streams, 'far')).toEqual(['Early', 'Alpha', 'Beta', 'Gamma', 'Delta', 'Zeta'])
    expect(sentOut(streams, 'near')).toEqual(['Alpha', 'Delta'])
  })

  it('splits six far species a battle into streams the decoder takes back', () => {
    const many = { ...anims, front: new Map([...anims.front, ['SPECIES_G', 'ANIM_V_SHAKE_SLOW']]) }
    const split = sendOutStreams(many, SPECIES, PICS)
    expect(split.map((stream) => stream.name)).toEqual([`${SEND_OUTS}-1`, `${SEND_OUTS}-2`])
    expect(sentOut(split, 'far')).toEqual([
      'Early',
      'Alpha',
      'Beta',
      'Gamma',
      'Delta',
      'Zeta',
      'Eta',
    ])
    expect(sentOut(split, 'near')).toEqual(['Alpha', 'Delta', 'Alpha'])
    for (const { stream } of split) {
      expect(decodeStream(encodeStream(stream))).toEqual(stream)
      expect(stream.instructions.at(-1)).toEqual({ op: 'end', outcome: 'unknown' })
    }
  })

  it('reaches every front animation and back set a species holds', () => {
    const coverage = sendOutCoverage(streams, anims, SPECIES)
    expect(coverage.missed).toEqual([])
    expect(coverage.heldByNone).toEqual(['ANIM_ROTATE_TO_SIDES'])
  })

  it('names an animation whose send-out the streams lack', () => {
    const [first] = streams
    if (first === undefined) throw new Error('no stream')
    const cut = first.stream.instructions.filter(
      (instruction) =>
        !(instruction.op === 'switchIn' && instruction.side === 'far' && instruction.slot === 4),
    )
    const lacking = [{ ...first, stream: { ...first.stream, instructions: cut } }]
    expect(sendOutCoverage(lacking, anims, SPECIES).missed).toEqual(['ANIM_GROW'])
  })
})

const tree = readerTree()
describe.skipIf(!existsSync(tree))('the send-out streams of the pinned tree', () => {
  const read = (path: string) => readFileSync(join(tree, path), 'utf8')

  it('reach every animation the species tables hold', () => {
    const anims = readSendOutAnimations(read)
    const streams = sendOutStreams(anims, speciesTable, PICS)
    const coverage = sendOutCoverage(streams, anims, speciesTable)
    expect(coverage.missed).toEqual([])
    expect(anims.functions.length).toBeGreaterThan(150)
    for (const { stream } of streams) expect(decodeStream(encodeStream(stream))).toEqual(stream)
  })
})
