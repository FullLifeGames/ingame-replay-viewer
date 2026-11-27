import { describe, expect, it } from 'vitest'

import slotHeader from '../../rom/gen3/include/replay_slot.h?raw'
import { buildBattleScript } from '../script/build'
import type { ScriptEvent } from '../script/events'
import type { Side } from '../script/types'
import { REPLAYS, replayScript } from '../script/testing'
import { crc32 } from '../patch/crc32'
import { buildGen3Stream, type Gen3Stream } from './backend'
import { type Fallback, illusionGap, mechanicGap, showsInPlace } from './fallbacks'
import { decodeStream } from './stream/decode'
import { itemOf } from './tables/lookup'
import { itemGaps } from './tables/testing'
import { decodeText, encodeText } from './text/charset'
import { PARTIAL_TRAP_SCENE } from './text/phrases-status'
import { phraseGap } from './text/template'
import { translate, type Translation } from './translate'

/** A define of `replay_slot.h`, which holds the slot's layout (ADR 0008). */
function slotDefine(name: string): number {
  const match = new RegExp(`^#define\\s+${name}\\s+(0x[0-9A-F]+|\\d+)\\s*$`, 'm').exec(slotHeader)
  if (match?.[1] === undefined) throw new Error(`replay_slot.h has no number ${name}`)
  return Number(match[1])
}

/** The bytes a stream may take in the slot: the slot without its own header. */
const CAPACITY = slotDefine('REPLAY_SLOT_SIZE') - slotDefine('REPLAY_SLOT_HEADER_SIZE')

/** The event kinds the stream holds in its header tables, with no instruction of their own. */
const HEADER_KINDS: ReadonlySet<ScriptEvent['kind']> = new Set(['player', 'teamSize'])

/**
 * `text` as its bytes read back: characters that share a byte read as the charmap's first one
 * (`'` as `’`, `_` as `-`), which the game draws alike.
 */
const charsetRead = (text: string) => decodeText(encodeText(text))

/**
 * The mechanic fallbacks the test replays may take, each a look or a state the stream lacks:
 * Perish Song's first count, whose later counts print; Bide's first turn, which the expansion
 * shows as the move alone; Protosynthesis's end, which the expansion has no message for; and
 * Illusion's end, which the stream plays as a switch (#98), in both Gen 9 random battles. A new
 * one fails until it is named here, and one that no test replay takes fails unless NAMED_AHEAD
 * holds it.
 */
const NAMED_MECHANICS: ReadonlySet<string> = new Set([
  mechanicGap('perish3', 'starting').detail,
  mechanicGap('Bide', 'starting').detail,
  mechanicGap('Protosynthesis', 'ending').detail,
  illusionGap().detail,
])

/**
 * The phrase fallbacks a test replay may take, each a scene the game has no message for: Gen 1's
 * partial trap that keeps its target from moving, which the expansion's traps never do. A new one
 * fails until it is named here.
 */
const NAMED_PHRASES: ReadonlySet<string> = new Set([phraseGap(PARTIAL_TRAP_SCENE).detail])

/**
 * The move fallbacks a test replay may take, each a look of a move that the log names and the game
 * lacks, so the move plays its own animation. None since #89: Ogerpon's Ivy Cudgel in its Water
 * look plays as the game's own, by its type. A new one fails until it is named here.
 */
const NAMED_LOOKS: ReadonlySet<string> = new Set<string>()

/**
 * The entries above that no test replay takes yet, named ahead for a replay to come: Bide's first
 * turn (#60) and Gen 1's partial trap, which the content-gap test below takes. Bide's entry leaves
 * this list once a test replay with Bide's first turn joins the fixtures.
 */
const NAMED_AHEAD: ReadonlySet<string> = new Set([
  mechanicGap('Bide', 'starting').detail,
  phraseGap(PARTIAL_TRAP_SCENE).detail,
])

/**
 * The item fallbacks a test replay may take: the items of its generation the expansion lacks
 * (`itemGaps`), which play as text alone. Any other content gap fails.
 */
const itemGapDetails = (gen: number): ReadonlySet<string> =>
  new Set(itemGaps(gen).flatMap((name) => itemOf(name).fallback?.detail ?? []))

/** Whether a list above names `fallback`, from a battle of `gen`. */
function isNamed({ kind, detail }: Fallback, gen: number): boolean {
  if (kind === 'item') return itemGapDetails(gen).has(detail)
  if (kind === 'move') return NAMED_LOOKS.has(detail)
  return kind === 'phrase' && NAMED_PHRASES.has(detail)
}

/**
 * The fallbacks of `stream`, from a battle of `gen`, that show something in place of a content
 * gap and that no list above names.
 */
const contentGaps = (stream: Gen3Stream, gen: number): Fallback[] =>
  stream.fallbacks.filter((fallback) => showsInPlace(fallback) && !isNamed(fallback, gen))

const listed = (fallbacks: readonly Fallback[]) =>
  fallbacks.map(({ line, detail }) => `${String(line)}: ${detail}`)

const replays = REPLAYS.map(({ id }) => {
  const script = replayScript(id)
  return { id, script, stream: buildGen3Stream(script), tables: translate(script) }
})

/**
 * The stream as JSON lines: first the header tables with the byte length and checksum, then one
 * row per instruction with its log line and its text in Unicode, then the fallbacks.
 */
function toJsonl({ bytes, instructions, fallbacks }: Gen3Stream, tables: Translation): string {
  const { trainers, parties } = tables
  const crc = crc32(bytes).toString(16).padStart(8, '0')
  const rows = [
    { length: bytes.length, crc32: crc, trainers, parties },
    ...instructions.map(({ line, instruction }) => ({ line, ...instruction })),
    ...fallbacks.map(({ line, kind, detail }) => ({ line, fallback: kind, detail })),
  ]
  return rows.map((row) => `${JSON.stringify(row)}\n`).join('')
}

describe.each(replays)('the instruction stream of $id', ({ id, script, stream, tables }) => {
  it('matches its snapshot', async () => {
    await expect(toJsonl(stream, tables)).toMatchFileSnapshot(`./__snapshots__/${id}.jsonl`)
  })

  it('takes no fallback that shows something in place of a content gap', () => {
    const gaps = contentGaps(stream, script.gen)
    expect(gaps, listed(gaps).join('\n')).toEqual([])
  })

  it('takes mechanic fallbacks only for the silent effects named above', () => {
    const unnamed = stream.fallbacks.filter(
      (fallback) => !showsInPlace(fallback) && !NAMED_MECHANICS.has(fallback.detail),
    )
    expect(unnamed.map(({ line, detail }) => `${String(line)}: ${detail}`)).toEqual([])
  })

  it('fits the replay slot', () => {
    expect(stream.bytes.length).toBeLessThanOrEqual(CAPACITY)
  })

  it('gives every event line an instruction, header data or a listed fallback', () => {
    const covered = new Set([
      ...stream.instructions.map(({ line }) => line),
      ...stream.fallbacks.map(({ line }) => line),
      ...script.events.filter(({ kind }) => HEADER_KINDS.has(kind)).map(({ line }) => line),
    ])
    const silent = script.events.filter(({ line }) => !covered.has(line))
    expect(silent.map(({ line, kind }) => `${String(line)} ${kind}`)).toEqual([])
  })

  it('decodes back to its model, as the charset reads it', () => {
    const { trainers, parties } = tables
    const instructions = stream.instructions.map(({ instruction }) =>
      instruction.op === 'print'
        ? { ...instruction, text: charsetRead(instruction.text) }
        : instruction,
    )
    const trainer = (side: Side) => ({
      ...trainers[side],
      name: charsetRead(trainers[side].name),
    })
    const party = (side: Side) =>
      parties[side].map((mon) => mon && { ...mon, nickname: charsetRead(mon.nickname) })
    expect(decodeStream(stream.bytes)).toEqual({
      trainers: { near: trainer('near'), far: trainer('far') },
      parties: { near: party('near'), far: party('far') },
      instructions,
    })
  })
})

describe('the named lists', () => {
  // A gap that the backend closes leaves its entry behind (D9): the lists shrink with the gaps.
  it('name only fallbacks that a test replay takes, or those named ahead', () => {
    const taken = new Set(replays.flatMap(({ stream }) => stream.fallbacks.map((f) => f.detail)))
    const named = [...NAMED_MECHANICS, ...NAMED_PHRASES, ...NAMED_LOOKS]
    const untaken = named.filter((detail) => !taken.has(detail))
    expect(untaken.toSorted()).toEqual([...NAMED_AHEAD].toSorted())
  })
})

/** A Gen 1 battle of Alice's Dugtrio and Bob's Cloyster, then `lines`. */
const gen1StreamOf = (...lines: string[]) =>
  buildGen3Stream(
    buildBattleScript(
      [
        '|gen|1',
        '|player|p1|Alice|1|',
        '|player|p2|Bob|2|',
        '|teamsize|p1|6',
        '|teamsize|p2|6',
        '|start',
        '|switch|p1a: Dugtrio|Dugtrio|100/100',
        '|switch|p2a: Cloyster|Cloyster|100/100',
        ...lines,
        '',
      ].join('\n'),
    ),
  )

describe('the content-gap test', () => {
  it('lets a partial trap that keeps a Gen 1 Pokémon from moving pass through the named list', () => {
    const stream = gen1StreamOf('|turn|1', '|cant|p1a: Dugtrio|partiallytrapped')

    expect(stream.fallbacks.map(({ kind }) => kind)).toContain('phrase')
    expect(listed(contentGaps(stream, 1))).toEqual([])
  })

  it('fails a phrase fallback the named list leaves out', () => {
    const stream = gen1StreamOf('|turn|1', '|-miss|p1a: Dugtrio')

    expect(listed(contentGaps(stream, 1))).toEqual([
      '9: no game message for a miss without a target',
    ])
  })
})
