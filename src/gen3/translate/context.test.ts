import { describe, expect, it } from 'vitest'

import { buildBattleScript } from '../../script/build'
import { scriptOf } from '../../script/testing'
import { Gen3Error } from '../errors'
import { Context } from './context'

describe('Context', () => {
  it('splits a text too long for one PRINT at a word', () => {
    const ctx = new Context(scriptOf())
    ctx.print(3, `${'word '.repeat(60)}end`)
    const texts = ctx.instructions.map(({ instruction }) => instruction)
    expect(texts.map((instruction) => instruction.op)).toEqual(['print', 'print'])
    expect(ctx.instructions.every(({ line }) => line === 3)).toBe(true)
  })

  it('lists what a phrase reports with its line', () => {
    const ctx = new Context(scriptOf())
    ctx.print(9, { text: 'Hi!', fallback: { kind: 'phrase', detail: 'no game message for hi' } })
    expect(ctx.fallbacks).toEqual([{ line: 9, kind: 'phrase', detail: 'no game message for hi' }])
  })

  it('refuses a team member the log never showed and a side with no player', () => {
    const ctx = new Context(buildBattleScript('|gen|3\n|start\n'))
    expect(() => ctx.mon({ side: 'near', index: 0 })).toThrow(Gen3Error)
    expect(() => ctx.species({ side: 'far', index: 0 })).toThrow(/no team member 0 on the far/)
    expect(() => ctx.player('far')).toThrow(/no player on the far side/)
  })
})
