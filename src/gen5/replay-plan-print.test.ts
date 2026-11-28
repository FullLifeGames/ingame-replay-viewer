import { describe, expect, it } from 'vitest'

import type { AdapterNumbers } from './adapter.ts'
import { ADAPTER_LAYOUT } from './adapter.fixtures.ts'
import { printedCommand } from './backend/printed.ts'
import { GEN5_REPLAY_VERSION, type Gen5Replay } from './backend/replay.ts'
import { REPLAY_NUMBERS } from './backend/replay.fixtures.ts'
import { macroPlayer, type MacroStep } from './macro.ts'
import { fieldsAfterHold, writesAfterHold } from './plan-writes.ts'
import type { ReadRam } from './ram-check.ts'
import { type MemoryWrite, wordWrites } from './ram-write.ts'
import { answered, blockSteps, replayPlan, replaySteps } from './replay-plan.ts'
import { armWrites, formattedCheck, pageWrites, TEXT_LIMIT, textBox } from './text-box.ts'

// Invented numbers: the adapter and the text box of src/gen5's fixtures, an adapter address and a
// heap of our own behind the text box's chain.
const ADAPTER_NUMBERS: AdapterNumbers = {
  layout: ADAPTER_LAYOUT,
  serverCmd: 0x0b,
  heldState: 2,
  queueSize: REPLAY_NUMBERS.queueSize,
}
const ADAPTER = 0x02134000
const SETUP = {
  adapterNumbers: ADAPTER_NUMBERS,
  table: REPLAY_NUMBERS,
  adapter: ADAPTER,
  pin: 'c0ffee',
}
const BOX = REPLAY_NUMBERS.textBox
const PAGE = 'isolatedstar forfeited.'

const BARE: Gen5Replay = {
  version: GEN5_REPLAY_VERSION,
  pin: 'c0ffee',
  trainers: { player: 'Alice', opponent: 'Bob' },
  parties: { player: [], opponent: [] },
  blocks: [
    { name: 'b1', lines: [9], commands: [{ command: 'SC_UPDATE_HP_GAUGE', args: [1] }] },
    { name: 'b2', lines: [12], commands: [printedCommand(REPLAY_NUMBERS)], print: PAGE },
    { name: 'b3', lines: [15], commands: [{ command: 'SC_UPDATE_HP_GAUGE', args: [2] }] },
  ],
  fallbacks: [],
  dropped: [],
}
const PRINTING: Gen5Replay = { ...BARE, textBox: BOX }
const PRINTED = PRINTING.blocks[1] ?? { name: '', commands: [] }

const named = (step: MacroStep) => ('name' in step ? `${step.kind} ${step.name}` : step.kind)
const stepOf = (steps: readonly MacroStep[], kind: string, name: string) =>
  steps.find((step) => step.kind === kind && 'name' in step && step.name === name)

// Scene: the forfeit prints in the game's window. The page empties the window's buffer with the
// carrier's block, waits for the client's format, writes the page over it before the stream reads
// a character, and waits for the answer as for any block.
describe('a printed block', () => {
  const steps = replaySteps(PRINTING, SETUP)

  it('checks the box, writes the block, waits for the format, writes the page, then the answer', () => {
    expect(steps.map(named)).toEqual([
      'write b1',
      'until b1',
      'mark b1-answered',
      'until b2-box',
      'write b2',
      'until b2-text',
      'write b2-text',
      'until b2',
      'mark b2-answered',
      'write b3',
      'until b3',
      'mark b3-answered',
    ])
  })

  it('guards the box at once, and again with the format before the page', () => {
    const { guard } = textBox(BOX)
    expect(stepOf(steps, 'until', 'b2-box')).toEqual({
      kind: 'until',
      name: 'b2-box',
      checks: guard,
      holdFor: 1,
      limit: 1,
    })
    expect(stepOf(steps, 'until', 'b2-text')).toEqual({
      kind: 'until',
      name: 'b2-text',
      checks: [...guard, formattedCheck(BOX)],
      holdFor: 1,
      limit: TEXT_LIMIT,
    })
  })

  it('arms the buffer before the carrier’s writes, `returned` last, and writes the page alone', () => {
    const plain = blockSteps(SETUP, { name: 'b2', commands: PRINTED.commands })[0]
    const write = stepOf(steps, 'write', 'b2')
    if (write?.kind !== 'write' || plain?.kind !== 'write') throw new Error('no write b2')
    expect(write.writes).toEqual([...armWrites(BOX), ...plain.writes])
    expect(write.writes.at(-1)).toMatchObject({ field: 'returned' })
    expect(stepOf(steps, 'write', 'b2-text')).toEqual({
      kind: 'write',
      name: 'b2-text',
      writes: pageWrites(BOX, PAGE),
    })
    expect(stepOf(steps, 'until', 'b2')).toMatchObject({ checks: [answered(SETUP)] })
  })

  it('throws by its name before any step when the replay carries no text box', () => {
    const why = 'b2 (lines 12) prints a page, but the replay carries no text box'
    expect(() => replaySteps(BARE, SETUP)).toThrow(why)
    expect(() => replayPlan(BARE, SETUP)).toThrow(why)
  })

  it('throws by its name on a page past the buffer’s room', () => {
    const long = { ...PRINTED, print: 'x'.repeat(BOX.room) }
    expect(() => blockSteps(SETUP, long, BOX)).toThrow(/^b2 \(lines 12\): core\.strbuf: "x+" cut/)
  })
})

/** A main RAM of bytes with the text box's chain to a valid, empty StrBuf. */
function fakeRam() {
  const bytes = new Map<number, number>()
  const put = (address: number, value: number, width: number) => {
    for (let i = 0; i < width; i += 1) bytes.set(address + i, Math.floor(value / 256 ** i) % 256)
  }
  const read: ReadRam = (address, width) => {
    let value = 0
    for (let i = width - 1; i >= 0; i -= 1) value = value * 256 + (bytes.get(address + i) ?? 0)
    return value
  }
  const apply = (writes: readonly MemoryWrite[]) => {
    for (const write of writes) {
      const words = wordWrites(write, (address) => read(address, 4))
      if ('fault' in words) throw new Error(words.fault)
      for (const word of words.words) put(word.address, word.value, 4)
    }
  }
  const [module, core, strbuf] = [0x02110000, 0x02120000, 0x02130000]
  const at = (member: string) => strbuf + (BOX.strBuf.fields[member]?.offset ?? NaN)
  put(BOX.stringWork.address + BOX.mainModule, module, 4)
  put(module + BOX.viewCore, core, 4)
  put(core + BOX.strbuf, strbuf, 4)
  put(at('magic'), BOX.constants.STRBUF_MAGIC, 4)
  put(at('size'), BOX.room, 4)
  put(at('chars'), BOX.constants.CHAR_EOM, 2)
  return { read, put, apply, at }
}

/** The units from the buffer's first character up to the terminator, within its room. */
function bufferText(ram: ReturnType<typeof fakeRam>) {
  const units = Array.from({ length: BOX.room }, (_, i) => ram.read(ram.at('chars') + 2 * i, 2))
  return String.fromCharCode(...units.slice(0, units.indexOf(BOX.constants.CHAR_EOM)))
}

type Ram = ReturnType<typeof fakeRam>

/** A fake client that takes a block on the frame it is written, formats the carrier
 * `formatAfter` frames into a block that armed the box, and answers 6 frames after that (a block
 * that prints nothing: 6 frames after its write). It notes the frames of each format. */
function fakeClient(ram: Ram, formatAfter: number) {
  const formats: number[] = []
  let block: { at: number; prints: boolean } | undefined
  const frame = (at: number, fields: ReadonlySet<string>) => {
    if (fields.has('cmd')) block = { at, prints: fields.has('core.strbuf') }
    if (block === undefined) return
    const spent = at - block.at
    if (block.prints && spent === formatAfter) {
      ram.apply(pageWrites(BOX, 'But nothing happened!'))
      formats.push(at)
    }
    if (spent === (block.prints ? formatAfter : 0) + 6) {
      ram.put(ADAPTER + 0x20, 0x10, 1)
      block = undefined
    }
  }
  return { frame, formats }
}

/** Plays `steps` frame by frame on the fake client: the frames of each format and each page
 * write, why the plan failed, and the buffer's text at its end. */
function play(steps: readonly MacroStep[], formatAfter: number) {
  const ram = fakeRam()
  const client = fakeClient(ram, formatAfter)
  const player = macroPlayer(steps)
  const page: number[] = []
  for (let frame = 0; frame < 2000; frame += 1) {
    const input = player.next(ram.read)
    if (input.done) {
      return { format: client.formats, page, failed: input.failed, text: bufferText(ram) }
    }
    const fields = new Set((input.writes ?? []).map((write) => write.field))
    if (fields.has('core.strbuf') && !fields.has('cmd')) page.push(frame)
    ram.apply(input.writes ?? [])
    client.frame(frame, fields)
  }
  throw new Error('the fake client never ended the plan')
}

// Scene: the client formats the carrier on the frame it takes the block or a few later. The page
// reads RAM at every frame boundary and writes the page in the boundary right after the format,
// so the paused stream never reads a letter of the carrier.
describe('a printed block on a fake client', () => {
  const steps = replaySteps(PRINTING, SETUP)

  for (const formatAfter of [0, 1, 4]) {
    it(`writes the page in the frame right after a format ${String(formatAfter)} frames in`, () => {
      const run = play(steps, formatAfter)
      expect(run.failed).toBeUndefined()
      expect(run.format).toHaveLength(1)
      expect(run.page).toEqual(run.format.map((frame) => frame + 1))
      expect(run.text).toBe(PAGE)
    })
  }

  it('never writes the page before the format, and fails by the block’s name', () => {
    const run = play(steps, Infinity)
    expect(run.page).toEqual([])
    expect(run.failed).toMatch(
      new RegExp(
        `"b2-text" did not hold within ${String(TEXT_LIMIT)} frames; last: strbuf\\.chars\\[0\\]`,
      ),
    )
  })
})

// Scene: a printed block changes nothing the client acts on but its block and its window's buffer:
// it asks no action of the player, so no hint line shows.
describe('a printing replay after the hold', () => {
  const plan = replayPlan(PRINTING, SETUP)
  const { buffer } = textBox(BOX)
  const boxFields = [buffer.field, `${buffer.field} length`]

  it('asks no action of the player', () => {
    expect(writesAfterHold(plan)).toEqual({
      commands: [ADAPTER_NUMBERS.serverCmd],
      states: [ADAPTER_NUMBERS.heldState],
    })
  })

  it('touches adapter fields and the text box’s alone', () => {
    const fields = fieldsAfterHold(plan)
    const allowed = [...Object.keys(ADAPTER_LAYOUT.fields), ...boxFields]
    expect(fields.filter((field) => !allowed.includes(field))).toEqual([])
    expect(fields).toEqual(expect.arrayContaining([...boxFields, 'cmd', 'returned']))
  })

  it('refuses to read a plan with no hold', () => {
    expect(() => fieldsAfterHold(replaySteps(PRINTING, SETUP))).toThrow('it has no write hold')
  })
})
