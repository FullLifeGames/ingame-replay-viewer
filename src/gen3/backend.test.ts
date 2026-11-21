import { describe, expect, it } from 'vitest'

import { scriptOf } from '../script/testing'
import { buildGen3Stream } from './backend'
import { Gen3Error } from './errors'
import { decodeStream } from './stream/decode'
import { speciesOf } from './tables/lookup'
import trainerPics from './tables/trainer-pics.json'
import { streamOfLog } from './testing'

const full = { maxHp: 100, level: 100, shiny: false } as const

describe('buildGen3Stream', () => {
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
      { line: 5, instruction: { op: 'print', text: 'Bob would like to battle!' } },
      { line: 7, instruction: { op: 'print', text: 'Bob sent out Tyranitar!' } },
      { line: 7, instruction: { op: 'sendOut', side: 'far', slot: 0, hp: 100, status: 'none' } },
      { line: 6, instruction: { op: 'print', text: 'Go! Dugtrio!' } },
      { line: 6, instruction: { op: 'sendOut', side: 'near', slot: 0, hp: 100, status: 'none' } },
      { line: 7, instruction: { op: 'end', outcome: 'unknown' } },
    ])
    expect(stream.instructions).toEqual(result.instructions.map(({ instruction }) => instruction))
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

const nulls = (count: number) => Array.from({ length: count }, () => null)
