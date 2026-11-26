import { describe, expect, it } from 'vitest'

import cTests from '../../../rom/gen3/test/replay_refuse_order.c?raw'
import { buildBattleScript } from '../../script/build'
import { REPLAYS } from '../../script/testing'
import { buildGen3Stream } from '../backend'
import { Gen3Error } from '../errors'
import { streamOfLog } from '../testing'
import { decodeStream } from './decode'
import { encodeStream } from './encode'
import { ANIM, type Op, OP, ORDER } from './format'
import { checkOrder } from './order'
import { anim, END, ORDER_CASES, rawBytes, streamOf } from './testing'

describe('checkOrder, the encoder and the decoder', () => {
  for (const { name, instructions, refused } of ORDER_CASES) {
    it(name, () => {
      const stream = [...instructions, END]
      if (refused === undefined) {
        expect(() => {
          checkOrder(stream)
        }).not.toThrow()
        expect(decodeStream(encodeStream(streamOf(stream)))).toEqual(streamOf(stream))
        return
      }
      expect(() => {
        checkOrder(stream)
      }).toThrow(Gen3Error)
      expect(() => {
        checkOrder(stream)
      }).toThrow(refused)
      expect(() => encodeStream(streamOf(stream))).toThrow(refused)
      expect(() => decodeStream(rawBytes(stream))).toThrow(refused)
    })
  }

  // One case per test replay: the loop over all of them ran past 5 s under a second heavy run
  // (#92).
  it.each(REPLAYS)("lets test replay $id's stream through", ({ log }) => {
    const { bytes } = buildGen3Stream(buildBattleScript(log))
    expect(() => {
      checkOrder(decodeStream(bytes).instructions)
    }).not.toThrow()
  })

  it('lets the backend write a double KO by Explosion in sand, its upkeep and both switch-ins', () => {
    const { instructions } = streamOfLog(
      '|-weather|Sandstorm',
      '|move|p1a: Dugtrio|Explosion|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|0 fnt',
      '|faint|p2a: Tyranitar',
      '|faint|p1a: Dugtrio',
      '|',
      '|-weather|Sandstorm|[upkeep]',
      '|upkeep',
      '|switch|p1a: Skarmory|Skarmory, F|100/100',
      '|switch|p2a: Gengar|Gengar, M|100/100',
      '|turn|2',
    )
    const ops = instructions.map(({ instruction }) => instruction)
    const upkeep = ops.findIndex((instruction) => instruction.op === 'anim')
    expect(ops[upkeep]).toEqual(anim('near', 'sandstormContinues'))
    expect(ops.slice(0, upkeep).filter(({ op }) => op === 'faint')).toHaveLength(2)
    expect(() => {
      checkOrder(ops)
    }).not.toThrow()
  })
})

describe('ORDER', () => {
  const bits = (numbers: readonly number[]) => numbers.reduce((mask, n) => mask | (1 << n), 0)

  it('names the ops whose side operands need a battler out', () => {
    const ops: readonly Op[] = [
      'withdraw',
      'move',
      'hit',
      'hp',
      'faint',
      'stat',
      'anim',
      'volatile',
      'ability',
      'itemPopUp',
      'trapTurn',
      'formChange',
      'showMon',
      'tera',
    ]
    expect(ORDER.onFieldOps).toBe(bits(ops.map((op) => OP[op])))
  })

  it('frees the five weather anims', () => {
    const anims = [
      'rainContinues',
      'sunContinues',
      'sandstormContinues',
      'hailContinues',
      'snowContinues',
    ] as const
    expect(ORDER.freeAnims).toBe(bits(anims.map((name) => ANIM[name])))
  })

  it('fits each mask in 32 bits', () => {
    expect(Math.max(...Object.values(OP), ...Object.values(ANIM))).toBeLessThan(32)
  })
})

// A TEST of replay_refuse_order.c: the ops its stream writes, each with its side operands in
// order, and the error it expects.
interface CTest {
  readonly ops: readonly string[]
  readonly errors: readonly string[]
}

const sidesOf = (values: readonly unknown[]) =>
  values.filter((value) => value === 'near' || value === 'far')

function parseCTests(text: string): Map<string, CTest> {
  const tests = new Map<string, CTest>()
  for (const match of text.matchAll(/^TEST\("Replay: order: ([^"]+)"\)\n\{\n([\s\S]*?)^\}/gm)) {
    const [, name, body] = match as unknown as [string, string, string]
    const ops = [...body.matchAll(/ReplayStream_(\w+)\(([^)]*)\)/g)]
      .filter(([, call = '']) => !['Begin', 'Mon', 'Data', 'Length'].includes(call))
      .map(([, call = '', args = '']) => {
        const sides = sidesOf(
          args.split(', ').map((arg) => arg.replace('REPLAY_SIDE_', '').toLowerCase()),
        )
        return [call.charAt(0).toLowerCase() + call.slice(1), ...sides].join(' ')
      })
    const errors = [...body.matchAll(/REPLAY_ERROR_\w+/g)].map((error) => error[0])
    tests.set(name, { ops, errors })
  }
  return tests
}

// The cases whose TEST is missing or writes other ops, sides or verdicts.
function mismatches(text: string): string[] {
  const c = parseCTests(text)
  return ORDER_CASES.filter(({ name, instructions, refused }) => {
    const errors = [refused === undefined ? 'REPLAY_ERROR_NONE' : 'REPLAY_ERROR_ORDER']
    const ops = [...instructions, END].map((i) => [i.op, ...sidesOf(Object.values(i))].join(' '))
    return JSON.stringify(c.get(name)) !== JSON.stringify({ ops, errors })
  }).map(({ name }) => name)
}

describe('the order cases in TypeScript and in replay_refuse_order.c (I5)', () => {
  it('gives every case its TEST with the same ops, sides and verdict', () => {
    expect(mismatches(cTests)).toEqual([])
  })

  it('fails a TEST whose MOVE swaps its sides', () => {
    const swapped = cTests.replace(
      'Move(REPLAY_SIDE_NEAR, REPLAY_SIDE_FAR',
      'Move(REPLAY_SIDE_FAR, REPLAY_SIDE_NEAR',
    )
    expect(swapped).not.toBe(cTests)
    expect(mismatches(swapped)).toEqual(['a MOVE before any SEND_OUT is refused'])
  })

  it('gives every TEST its case', () => {
    const c = parseCTests(cTests)
    const names = new Set(ORDER_CASES.map(({ name }) => name))
    for (const name of c.keys()) expect(names.has(name), `${name} has no case`).toBe(true)
    expect(c.size).toBe(ORDER_CASES.length)
  })
})
