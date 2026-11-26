// The tracked C file of the direct entry's routine, read as text: it runs in CI, which has no ARM
// compiler (D7).
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { ORDER_MEMBERS, ROUTINE_STAGES } from '../src/gen5/routine-order.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import {
  cDefines,
  checkOrderMembers,
  cStructMembers,
  LITERAL_BOUND,
  literalsAbove,
} from './gen5-routine-text.ts'

const SOURCE = readFileSync(GEN5_PATHS.routineSource, 'utf8')

const camel = (name: string) =>
  name.toLowerCase().replace(/_([a-z])/g, (_all, letter: string) => letter.toUpperCase())

describe('rom/gen5/routine.c', () => {
  it("declares the order block's members as the TypeScript list does", () => {
    const members = cStructMembers(SOURCE, 'OrderBlock')
    expect(members).toEqual([...ORDER_MEMBERS])
    expect(() => {
      checkOrderMembers(members, ORDER_MEMBERS)
    }).not.toThrow()
  })

  it('fails on a member added in C alone', () => {
    const added = SOURCE.replace('    u32 setup;\n', '    u32 setup;\n    u32 cheer;\n')
    expect(() => {
      checkOrderMembers(cStructMembers(added, 'OrderBlock'), ORDER_MEMBERS)
    }).toThrow(/cheer/)
  })

  it("switches both displays on at the go, before the music and the battle's proc", () => {
    const main = SOURCE.slice(SOURCE.indexOf('BOOL RoutineProc_Main('))
    const at = (call: string) => main.indexOf(`order->${call})(`)
    expect(at('enableEngines')).toBeGreaterThan(main.indexOf('order->go == FALSE'))
    expect(at('enableEngines')).toBeLessThan(at('bgmPlay'))
    expect(at('bgmPlay')).toBeLessThan(at('replaceProc'))
  })

  it('gives each stage the value the TypeScript side reads', () => {
    const stages = Object.fromEntries(
      Object.entries(cDefines(SOURCE, 'STAGE_')).map(([name, value]) => [camel(name), value]),
    )
    expect(stages).toEqual(ROUTINE_STAGES)
  })

  it(`holds no number of the game: no literal at or above ${String(LITERAL_BOUND)}`, () => {
    expect(literalsAbove(SOURCE, LITERAL_BOUND)).toEqual([])
  })

  it('includes no header', () => {
    expect(SOURCE).not.toMatch(/^\s*#\s*include/m)
  })
})
