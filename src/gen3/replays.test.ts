import { describe, expect, it } from 'vitest'

import slotHeader from '../../rom/gen3/include/replay_slot.h?raw'
import type { ScriptEvent } from '../script/events'
import type { Side } from '../script/types'
import { REPLAYS, replayScript } from '../script/testing'
import { crc32 } from '../patch/crc32'
import { buildGen3Stream, type Gen3Stream } from './backend'
import { mechanicGap, showsInPlace } from './fallbacks'
import { decodeStream } from './stream/decode'
import { itemOf } from './tables/lookup'
import { itemGaps } from './tables/testing'
import { decodeText, encodeText } from './text/charset'
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
 * The mechanic fallbacks the test replays may take, each a line the game shows nothing for:
 * Perish Song's first count, whose later counts print; Pursuit's activation, whose withdraw
 * line the switch after the hit prints (none after a knockout); Bide's first turn, which the
 * expansion shows as the move alone. A new one fails until it is named here.
 */
const NAMED_MECHANICS: ReadonlySet<string> = new Set([
  mechanicGap('perish3', 'starting').detail,
  mechanicGap('Pursuit', 'acting').detail,
  mechanicGap('Bide', 'starting').detail,
])

/**
 * The item fallbacks a test replay may take: the items of its generation the expansion lacks
 * (`itemGaps`), which play as text alone. Any other content gap fails.
 */
const itemGapDetails = (gen: number): ReadonlySet<string> =>
  new Set(itemGaps(gen).flatMap((name) => itemOf(name).fallback?.detail ?? []))

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
    const items = itemGapDetails(script.gen)
    const gaps = stream.fallbacks.filter(
      (fallback) =>
        showsInPlace(fallback) && !(fallback.kind === 'item' && items.has(fallback.detail)),
    )
    expect(gaps, gaps.map(({ line, detail }) => `${String(line)}: ${detail}`).join('\n')).toEqual(
      [],
    )
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
