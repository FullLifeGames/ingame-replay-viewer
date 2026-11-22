import { describe, expect, it } from 'vitest'

import { buildBattleScript } from '../script/build'
import { scriptOf } from '../script/testing'
import { buildGen3Stream } from './backend'
import { Gen3Error } from './errors'
import { decodeStream } from './stream/decode'
import { speciesOf } from './tables/lookup'
import trainerPics from './tables/trainer-pics.json'
import { streamOfLog } from './testing'

const full = { maxHp: 100, level: 100, shiny: false } as const

describe('buildGen3Stream', () => {
  it('takes each trainer pic from the avatar on the player line (#20)', () => {
    const log = [
      '|gen|3',
      '|player|p1|Alice|steven|',
      '|player|p2|Bob|red|',
      '|start',
      '|switch|p1a: Dugtrio|Dugtrio, M|100/100',
      '|switch|p2a: Tyranitar|Tyranitar, M|100/100',
    ]
    const { trainers } = decodeStream(buildGen3Stream(buildBattleScript(log.join('\n'))).bytes)
    expect(trainers.near.trainerPic).toBe(trainerPics.TRAINER_PIC_STEVEN)
    expect(trainers.far.trainerPic).toBe(trainerPics.TRAINER_PIC_RED)
  })

  it('opens with the trainers, the teams, INTRO and the leads far first (X1)', () => {
    const result = streamOfLog()
    const stream = decodeStream(result.bytes)
    expect(stream.trainers).toEqual({
      near: {
        name: 'Alice',
        trainerPic: trainerPics.TRAINER_PIC_BRENDAN,
        teamSize: 6,
        revealed: 1,
      },
      far: { name: 'Bob', trainerPic: trainerPics.TRAINER_PIC_MAY, teamSize: 6, revealed: 1 },
    })
    const dugtrio = { ...full, species: speciesOf('Dugtrio').number, gender: 'male' }
    const tyranitar = { ...full, species: speciesOf('Tyranitar').number, gender: 'male' }
    expect(stream.parties.near).toEqual([{ ...dugtrio, nickname: 'Dugtrio' }, ...nulls(5)])
    expect(stream.parties.far).toEqual([{ ...tyranitar, nickname: 'Tyranitar' }, ...nulls(5)])
    expect(result.instructions).toEqual([
      { line: 5, instruction: { op: 'intro' } },
      { line: 5, instruction: { op: 'print', text: 'You are challenged by Bob!' } },
      { line: 7, instruction: { op: 'print', text: 'Bob sent out Tyranitar!' } },
      { line: 7, instruction: { op: 'sendOut', side: 'far', slot: 0, hp: 100, status: 'none' } },
      { line: 6, instruction: { op: 'print', text: 'Go! Dugtrio!' } },
      { line: 6, instruction: { op: 'sendOut', side: 'near', slot: 0, hp: 100, status: 'none' } },
      { line: 7, instruction: { op: 'end', outcome: 'unknown' } },
    ])
    expect(stream.instructions).toEqual(result.instructions.map(({ instruction }) => instruction))
  })

  it('sends out leads with exact full HP at 100 (#41)', () => {
    const script = buildBattleScript(
      ['|gen|3', '|player|p1|Alice|1|', '|player|p2|Bob|2|', '|start'].join('\n') +
        '\n|switch|p1a: Metagross|Metagross|319/319\n|switch|p2a: Regice|Regice|364/364\n',
    )
    const sendOuts = buildGen3Stream(script).instructions.filter(
      ({ instruction }) => instruction.op === 'sendOut',
    )
    expect(sendOuts.map(({ instruction }) => instruction)).toEqual([
      { op: 'sendOut', side: 'far', slot: 0, hp: 100, status: 'none' },
      { op: 'sendOut', side: 'near', slot: 0, hp: 100, status: 'none' },
    ])
  })

  it('passes the dropped lines on and lists no fallback for a plain battle', () => {
    const script = scriptOf('|', '|turn|1')
    const result = buildGen3Stream(script)
    expect(result.dropped).toBe(script.dropped)
    expect(result.fallbacks).toEqual([])
    expect(result.instructions.at(-2)).toEqual({ line: 9, instruction: { op: 'turn', number: 1 } })
  })

  it('refuses a battle newer than Gen 3 (X16, D11)', () => {
    const script = { ...scriptOf(), gen: 4 }
    expect(() => buildGen3Stream(script)).toThrow(Gen3Error)
    expect(() => buildGen3Stream(script)).toThrow(/Gen 4/)
  })
})

describe('the team tables', () => {
  it('give each Pokémon its gender, and a side without a team size its revealed count', () => {
    const script = buildBattleScript(
      ['|gen|3', '|player|p1|Alice|1|', '|player|p2|Bob|2|', '|start'].join('\n') +
        '\n|switch|p1a: Skarmory|Skarmory, F|100/100\n|switch|p2a: Magneton|Magneton|100/100\n',
    )
    const { trainers, parties } = decodeStream(buildGen3Stream(script).bytes)
    expect([trainers.near.teamSize, trainers.far.teamSize]).toEqual([1, 1])
    expect([parties.near[0]?.gender, parties.far[0]?.gender]).toEqual(['female', 'none'])
  })

  it('list a nickname and a player name outside the charset with their lines', () => {
    const result = buildGen3Stream(
      buildBattleScript(
        [
          '|gen|3',
          '|player|p1|Alice★|1|',
          '|player|p2|Bob|2|',
          '|start',
          '|switch|p1a: Dug🙂|Dugtrio, M|100/100',
          '|switch|p2a: Tyranitar|Tyranitar, M|100/100',
        ].join('\n') + '\n',
      ),
    )
    expect(result.fallbacks.map(({ line, kind }) => [line, kind])).toEqual([
      [1, 'character'],
      [4, 'character'],
    ])
    const { trainers, parties } = decodeStream(result.bytes)
    expect([trainers.near.name, parties.near[0]?.nickname]).toEqual(['Alice?', 'Dug?'])
  })

  it('refuse a seventh Pokémon on one side', () => {
    const switches = ['Zapdos', 'Suicune', 'Claydol', 'Blissey', 'Gengar', 'Jirachi'].map(
      (species) => `|switch|p1a: ${species}|${species}|100/100`,
    )
    expect(() => streamOfLog(...switches)).toThrow(/reveals 7 Pokémon/)
  })
})

const nulls = (count: number) => Array.from({ length: count }, () => null)
