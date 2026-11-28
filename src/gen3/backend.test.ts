import { describe, expect, it } from 'vitest'

import { buildBattleScript } from '../script/build'
import { scriptOf } from '../script/testing'
import { buildGen3Stream, gensText, PLAYED_GENS, PLAYED_GENS_TEXT } from './backend'
import { Gen3Error, GenerationRefusal } from './errors'
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

  it('builds a stream for a Gen 4 battle (#86)', () => {
    const script = buildBattleScript(
      ['|gen|4', '|player|p1|Alice|1|', '|player|p2|Bob|2|', '|start'].join('\n') +
        '\n|switch|p1a: Dugtrio|Dugtrio, M|100/100\n|switch|p2a: Tyranitar|Tyranitar, M|100/100\n',
    )
    expect(buildGen3Stream(script).instructions.at(-1)).toEqual({
      line: 5,
      instruction: { op: 'end', outcome: 'unknown' },
    })
  })

  it('builds a stream for a Gen 5 battle (#87)', () => {
    const script = buildBattleScript(
      ['|gen|5', '|player|p1|Alice|1|', '|player|p2|Bob|2|', '|start'].join('\n') +
        '\n|switch|p1a: Jirachi|Jirachi|100/100\n|switch|p2a: Tyranitar|Tyranitar, M|100/100\n',
    )
    expect(buildGen3Stream(script).instructions.at(-1)).toEqual({
      line: 5,
      instruction: { op: 'end', outcome: 'unknown' },
    })
  })

  it('builds a stream for a Gen 6 battle (#125)', () => {
    const script = buildBattleScript(
      ['|gen|6', '|player|p1|Alice|1|', '|player|p2|Bob|2|', '|start'].join('\n') +
        '\n|switch|p1a: Venusaur|Venusaur, M|100/100\n|switch|p2a: Sylveon|Sylveon, F|100/100\n',
    )
    expect(buildGen3Stream(script).instructions.at(-1)).toEqual({
      line: 5,
      instruction: { op: 'end', outcome: 'unknown' },
    })
  })

  it('builds a stream for a Gen 9 battle (#88)', () => {
    const script = buildBattleScript(
      ['|gen|9', '|player|p1|Alice|1|', '|player|p2|Bob|2|', '|start'].join('\n') +
        '\n|switch|p1a: Ogerpon|Ogerpon, F|100/100\n|switch|p2a: Gholdengo|Gholdengo|100/100\n',
    )
    expect(buildGen3Stream(script).instructions.at(-1)).toEqual({
      line: 5,
      instruction: { op: 'end', outcome: 'unknown' },
    })
  })

  it.each([7, 8])(
    'refuses a Gen %i battle with a GenerationRefusal that carries the gen (#87, #88, #125)',
    (gen) => {
      const script = buildBattleScript(`|gen|${String(gen)}\n`)
      expect(() => buildGen3Stream(script)).toThrow(GenerationRefusal)
      expect(() => buildGen3Stream(script)).toThrow(expect.objectContaining({ gen }))
    },
  )

  it('refuses a Gen 8 log with a GenerationRefusal that names the played generations (#59, #88)', () => {
    const script = buildBattleScript('|gen|8\n')
    expect(() => buildGen3Stream(script)).toThrow(Gen3Error)
    expect(() => buildGen3Stream(script)).toThrow(
      expect.objectContaining({
        name: 'GenerationRefusal',
        gen: 8,
        message: 'the stream plays Gen 1 to 6 and Gen 9 battles, this one is Gen 8',
      }),
    )
  })
})

describe('gensText', () => {
  it('writes a run of generations as a range and joins the runs with "and" (#88)', () => {
    expect(gensText([1, 2, 3, 4, 5, 6, 9])).toBe('Gen 1 to 6 and Gen 9')
  })

  it('sorts the generations before it joins their runs', () => {
    expect(gensText([9, 1, 2])).toBe('Gen 1 to 2 and Gen 9')
  })

  it('writes a lone generation by its number', () => {
    expect(gensText([3])).toBe('Gen 3')
  })

  it('gives the played generations their words', () => {
    expect(PLAYED_GENS_TEXT).toBe(gensText(PLAYED_GENS))
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
