import { describe, expect, it } from 'vitest'

import { fitsSide, trainerPicOf } from './avatars'
import backPics from './trainer-back-pics.json'
import trainerPics from './trainer-pics.json'

const PIC = trainerPics

describe('trainerPicOf (#20)', () => {
  it('finds a pic by its whole name and keeps a near pic only with a back pic', () => {
    expect(trainerPicOf('near', 'steven')).toBe(PIC.TRAINER_PIC_STEVEN)
    expect(trainerPicOf('far', 'steven')).toBe(PIC.TRAINER_PIC_STEVEN)
    expect(trainerPicOf('far', 'red')).toBe(PIC.TRAINER_PIC_RED)
    expect(trainerPicOf('near', 'red')).toBe(PIC.TRAINER_PIC_RED)
  })

  it('finds a pic by a tail of its name and falls back to Brendan near without a back pic', () => {
    expect(trainerPicOf('far', 'norman')).toBe(PIC.TRAINER_PIC_LEADER_NORMAN)
    expect(trainerPicOf('near', 'norman')).toBe(PIC.TRAINER_PIC_BRENDAN)
    expect(trainerPicOf('far', 'lorelei')).toBe(PIC.TRAINER_PIC_ELITE_FOUR_LORELEI_FRLG)
  })

  it('drops the avatar suffix when the whole name finds nothing', () => {
    expect(trainerPicOf('far', 'wattson-gen3')).toBe(PIC.TRAINER_PIC_LEADER_WATTSON)
    expect(trainerPicOf('far', 'twins-gen4dp')).toBe(PIC.TRAINER_PIC_TWINS)
    expect(trainerPicOf('far', 'bugmaniac-gen3')).toBe(PIC.TRAINER_PIC_BUG_MANIAC)
    expect(trainerPicOf('far', 'magmagruntf-rse')).toBe(PIC.TRAINER_PIC_MAGMA_GRUNT_F)
  })

  it('ranks a FRLG pic below the Hoenn one and takes a FRLG pic the Hoenn set lacks', () => {
    expect(trainerPicOf('far', 'twins')).toBe(PIC.TRAINER_PIC_TWINS)
    expect(trainerPicOf('far', 'brock')).toBe(PIC.TRAINER_PIC_LEADER_BROCK_FRLG)
  })

  it('reads -rs as the Ruby and Sapphire pic and _M as the default', () => {
    expect(trainerPicOf('far', 'brendan-rs')).toBe(PIC.TRAINER_PIC_RS_BRENDAN)
    expect(trainerPicOf('near', 'brendan-rs')).toBe(PIC.TRAINER_PIC_RS_BRENDAN)
    expect(trainerPicOf('far', 'swimmer')).toBe(PIC.TRAINER_PIC_SWIMMER_M)
    expect(trainerPicOf('far', 'swimmerf')).toBe(PIC.TRAINER_PIC_SWIMMER_F)
    expect(trainerPicOf('far', 'aquagruntf')).toBe(PIC.TRAINER_PIC_AQUA_GRUNT_F)
  })

  it('keeps a far pic only with a front pic (S3-2)', () => {
    expect(trainerPicOf('near', 'pokedude')).toBe(PIC.TRAINER_PIC_POKEDUDE)
    expect(trainerPicOf('far', 'pokedude')).toBe(PIC.TRAINER_PIC_MAY)
    expect(trainerPicOf('near', 'oldman')).toBe(PIC.TRAINER_PIC_OLD_MAN)
    expect(trainerPicOf('far', 'oldman')).toBe(PIC.TRAINER_PIC_MAY)
  })

  it('falls back to Brendan near and May far for a number, a custom avatar, no match or none', () => {
    for (const avatar of ['265', '#uwliiiskyminflyers', 'hoopster', 'maniac', 'm', undefined]) {
      expect(trainerPicOf('near', avatar), String(avatar)).toBe(PIC.TRAINER_PIC_BRENDAN)
      expect(trainerPicOf('far', avatar), String(avatar)).toBe(PIC.TRAINER_PIC_MAY)
    }
  })
})

describe('fitsSide (#20)', () => {
  it('takes only a pic with a front pic far and only a pic with a back pic near', () => {
    expect(fitsSide('far', PIC.TRAINER_PIC_LEADER_NORMAN)).toBe(true)
    expect(fitsSide('far', PIC.TRAINER_PIC_STEVEN)).toBe(true)
    expect(fitsSide('far', PIC.TRAINER_PIC_POKEDUDE)).toBe(false)
    expect(fitsSide('far', PIC.TRAINER_PIC_OLD_MAN)).toBe(false)
    expect(fitsSide('near', PIC.TRAINER_PIC_LEADER_NORMAN)).toBe(false)
    for (const pic of Object.values(backPics)) expect(fitsSide('near', pic)).toBe(true)
  })

  it('lists back pics that are trainer pics under the same names', () => {
    for (const [name, pic] of Object.entries(backPics)) {
      expect(trainerPics[name as keyof typeof trainerPics], name).toBe(pic)
    }
    expect(backPics.TRAINER_PIC_STEVEN).toBe(PIC.TRAINER_PIC_STEVEN)
  })
})
