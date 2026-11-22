import { describe, expect, it } from 'vitest'

import cTests from '../../../rom/gen3/test/replay_refuse_order.c?raw'
import { buildBattleScript } from '../../script/build'
import { REPLAYS } from '../../script/testing'
import type { Side } from '../../script/types'
import { buildGen3Stream } from '../backend'
import { Gen3Error } from '../errors'
import { streamOfLog } from '../testing'
import { decodeStream } from './decode'
import { encodeStream } from './encode'
import { ANIM, type Op, OP, ORDER } from './format'
import type { Instruction } from './instructions'
import { checkOrder } from './order'
import { LEADS, rawBytes, streamOf } from './testing'

const END: Instruction = { op: 'end', outcome: 'tie' }
const intro: Instruction = { op: 'intro' }
const sendOut = (side: Side, slot = 0): Instruction => ({
  op: 'sendOut',
  side,
  slot,
  hp: 100,
  status: 'none',
})
const switchIn = (side: Side): Instruction => ({
  op: 'switchIn',
  side,
  slot: 1,
  hp: 100,
  status: 'none',
})
const move = (user: Side, target: Side): Instruction => ({ op: 'move', user, target, move: 1 })
const faint = (side: Side): Instruction => ({ op: 'faint', side })

interface OrderCase {
  /** The name of its TEST in replay_refuse_order.c, after "Replay: order: ". */
  readonly name: string
  /** The instructions before END. */
  readonly instructions: readonly Instruction[]
  /** The message of the refusal; a case without one passes. */
  readonly refused?: RegExp
}

// The cases both sides hold: each one a TEST in replay_refuse_order.c with the same ops.
const CASES: readonly OrderCase[] = [
  {
    name: 'a MOVE before any SEND_OUT is refused',
    instructions: [intro, move('near', 'far')],
    refused: /^move at 1 names the near side, which has no battler out$/,
  },
  {
    name: 'a SEND_OUT before INTRO is refused',
    instructions: [sendOut('near')],
    refused: /^sendOut at 0 comes before INTRO$/,
  },
  {
    name: 'an INTRO after the first instruction is refused',
    instructions: [{ op: 'turn', number: 1 }, intro],
    refused: /^intro at 1 is not the first instruction$/,
  },
  {
    name: 'a second INTRO is refused',
    instructions: [intro, intro],
    refused: /^intro at 1 is not the first instruction$/,
  },
  {
    name: 'a second SEND_OUT of the near side is refused',
    instructions: [...LEADS, sendOut('near', 1)],
    refused: /^sendOut at 3 names the near side, which has had a battler out$/,
  },
  {
    name: 'a SWITCH_IN while the battler is out is refused',
    instructions: [...LEADS, switchIn('near')],
    refused: /^switchIn at 3 names the near side, whose battler is still out$/,
  },
  {
    name: 'a SWITCH_IN of a side never sent out is refused',
    instructions: [intro, sendOut('near'), switchIn('far')],
    refused: /^switchIn at 2 names the far side, which has had no battler out$/,
  },
  {
    name: 'HP of a side whose battler fainted is refused',
    instructions: [...LEADS, faint('far'), { op: 'hp', side: 'far', hp: 0 }],
    refused: /^hp at 4 names the far side, which has no battler out$/,
  },
  {
    name: 'a FAINT twice is refused',
    instructions: [...LEADS, faint('far'), faint('far')],
    refused: /^faint at 4 names the far side, which has no battler out$/,
  },
  {
    name: 'a MOVE at a fainted target is refused',
    instructions: [...LEADS, faint('far'), move('near', 'far')],
    refused: /^move at 4 names the far side, which has no battler out$/,
  },
  {
    name: 'a status ANIM after a WITHDRAW is refused',
    instructions: [...LEADS, { op: 'withdraw', side: 'near' }, anim('near', 'statusPsn')],
    refused: /^anim at 4 names the near side, which has no battler out$/,
  },
  {
    name: 'a double KO in sand, the sand upkeep and both switch-ins pass',
    instructions: [
      ...LEADS,
      { op: 'weather', weather: 'sand' },
      move('near', 'far'),
      faint('far'),
      faint('near'),
      anim('near', 'sandstormContinues'),
      switchIn('near'),
      switchIn('far'),
    ],
  },
  {
    name: 'a WITHDRAW, then a SWITCH_IN and a MOVE pass',
    instructions: [
      ...LEADS,
      { op: 'withdraw', side: 'near' },
      switchIn('near'),
      move('near', 'far'),
    ],
  },
  {
    name: 'a STATUS and an ITEM of a benched slot pass',
    instructions: [
      ...LEADS,
      { op: 'status', side: 'far', slot: 1, status: 'slp' },
      { op: 'item', side: 'far', slot: 1, item: 1 },
    ],
  },
  {
    name: 'a WEATHER with no INTRO passes',
    instructions: [{ op: 'weather', weather: 'rain' }],
  },
  {
    name: 'TURN and PRINT with no INTRO pass',
    instructions: [
      { op: 'turn', number: 1 },
      { op: 'print', text: 'Hi' },
    ],
  },
]

function anim(side: Side, name: keyof typeof ANIM): Instruction {
  return { op: 'anim', side, anim: name }
}

describe('checkOrder, the encoder and the decoder', () => {
  for (const { name, instructions, refused } of CASES) {
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

  it("lets every test replay's stream through", () => {
    for (const { id, log } of REPLAYS) {
      const { bytes } = buildGen3Stream(buildBattleScript(log))
      expect(() => {
        checkOrder(decodeStream(bytes).instructions)
      }, id).not.toThrow()
    }
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
    ]
    expect(ORDER.onFieldOps).toBe(bits(ops.map((op) => OP[op])))
  })

  it('frees the four weather anims', () => {
    const anims = ['rainContinues', 'sunContinues', 'sandstormContinues', 'hailContinues'] as const
    expect(ORDER.freeAnims).toBe(bits(anims.map((name) => ANIM[name])))
  })

  it('fits each mask in 32 bits', () => {
    expect(Math.max(...Object.values(OP), ...Object.values(ANIM))).toBeLessThan(32)
  })
})

// A TEST of replay_refuse_order.c: its name, the ops its stream writes and the error it expects.
interface CTest {
  readonly ops: readonly string[]
  readonly errors: readonly string[]
}

function parseCTests(text: string): Map<string, CTest> {
  const tests = new Map<string, CTest>()
  for (const match of text.matchAll(/^TEST\("Replay: order: ([^"]+)"\)\n\{\n([\s\S]*?)^\}/gm)) {
    const [, name, body] = match as unknown as [string, string, string]
    const calls = [...body.matchAll(/ReplayStream_(\w+)\(/g)].map((call) => call[1] ?? '')
    const ops = calls
      .filter((call) => !['Begin', 'Mon', 'Data', 'Length'].includes(call))
      .map((call) => call.charAt(0).toLowerCase() + call.slice(1))
    const errors = [...body.matchAll(/REPLAY_ERROR_\w+/g)].map((error) => error[0])
    tests.set(name, { ops, errors })
  }
  return tests
}

describe('the order cases in TypeScript and in replay_refuse_order.c (I5)', () => {
  const c = parseCTests(cTests)

  it('gives every case its TEST with the same ops and the same verdict', () => {
    for (const { name, instructions, refused } of CASES) {
      const error = refused === undefined ? 'REPLAY_ERROR_NONE' : 'REPLAY_ERROR_ORDER'
      const ops = [...instructions, END].map(({ op }) => op)
      expect([name, c.get(name)]).toEqual([name, { ops, errors: [error] }])
    }
  })

  it('gives every TEST its case', () => {
    const names = new Set(CASES.map(({ name }) => name))
    for (const name of c.keys()) expect(names.has(name), `${name} has no case`).toBe(true)
    expect(c.size).toBe(CASES.length)
  })
})
