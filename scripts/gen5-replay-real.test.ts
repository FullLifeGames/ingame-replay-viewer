// The Gen 5 OU test replays on pokebw2's real numbers (#110, lane plan D12): build/gen5/bw2.json,
// which scripts/gen5-bw2.ts generates from the pinned checkout. The replay spec
// (src/gen5/backend/replays.test.ts) holds each replay's not-shown list on the invented numbers;
// a run plays the real ones, so the list must be the same there, every block must fit the real
// room, every printed page (#118) must fit the real window, and the plan must build. CI fetches
// the pin and generates the file before the check, so there a missing file fails the guard; on a
// machine without it the relations skip. CI's log is public, so every assertion compares kind
// names, block names, the replay's own texts or booleans, and an error of the backend is caught,
// since its text could name a number of pokebw2.
import { existsSync, readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'

import { describe, expect, it } from 'vitest'

import { adapterNumbers, blockRoom } from '../src/gen5/adapter.ts'
import { notShown } from '../src/gen5/backend/not-shown.ts'
import { printedCommand } from '../src/gen5/backend/printed.ts'
import type { Gen5Block, Gen5Replay } from '../src/gen5/backend/replay.ts'
import { REPLAY_NUMBERS } from '../src/gen5/backend/replay.fixtures.ts'
import { numbersOf } from '../src/gen5/build-files.ts'
import type { Bw2Numbers } from '../src/gen5/bw2-numbers.ts'
import { replayPlan } from '../src/gen5/replay-plan.ts'
import { packCommands } from '../src/gen5/server-cmd.ts'
import { replayTeam } from './gen5-moment-replay.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

const FILE = GEN5_PATHS.bw2Json
const IDS = ['gen5ou-2718717830', 'smogtours-gen5ou-862240']

/** An adapter address of our own; the run reads the real one from the heap. */
const ADAPTER = 0x02134000

// Scene: CI must never pass with the spec on real numbers skipped.
it.runIf(Boolean(process.env.CI))('finds build/gen5/bw2.json under CI', () => {
  expect(existsSync(FILE), 'build/gen5/bw2.json exists').toBe(true)
})

let cached: Bw2Numbers | undefined
const real = (): Bw2Numbers => (cached ??= JSON.parse(readFileSync(FILE, 'utf8')) as Bw2Numbers)

/** `build()`, or undefined where it throws: the error's text stays out of the log. */
function quietly<T>(build: () => T): T | undefined {
  try {
    return build()
  } catch {
    return undefined
  }
}

/** The replay `id` as the run builds it (scripts/gen5-moment-replay.ts). */
const replayOn = (id: string, numbers: Parameters<typeof replayTeam>[1]) =>
  replayTeam({ id, turns: undefined }, numbers).replay

const realReplay = (id: string): Gen5Replay | undefined => quietly(() => replayOn(id, real()))

type Printed = Gen5Block & { print: string }

/** The blocks of `replay` that print a page of ours. */
const printedOf = (replay: Pick<Gen5Replay, 'blocks'> | undefined): Printed[] =>
  (replay?.blocks ?? []).filter((block): block is Printed => block.print !== undefined)

/** Whether `page` stands in the real window: its lines, each line's width by font 0's advances,
 * and its characters with the terminator in the buffer's room. */
function fits(page: string, box: Bw2Numbers['textBox']): boolean {
  const lines = page.split('\n')
  const width = (line: string) => {
    let sum = 0
    for (const char of line) sum += box.advances[char] ?? Infinity
    return sum
  }
  const inLines = lines.length <= box.pageLines
  return inLines && lines.every((line) => width(line) <= box.windowWidth) && page.length < box.room
}

/** Each printed block's text with its line breaks as spaces. */
const textsOf = (blocks: readonly Printed[]) =>
  blocks.map(({ print }) => print.replaceAll('\n', ' '))

describe.skipIf(!existsSync(FILE))('the Gen 5 OU test replays on the real numbers', () => {
  // Scene: the run logs the not-shown list of the real numbers beside the replay spec's.
  it.each(IDS)('give %s the not-shown list of the replay spec', (id) => {
    const replay = realReplay(id)
    expect(replay !== undefined, 'the replay builds').toBe(true)
    const invented = replayOn(id, REPLAY_NUMBERS)
    expect(notShown(replay?.fallbacks ?? [])).toEqual(notShown(invented?.fallbacks ?? []))
  })

  // Scene: a block past the client's queue would stop the run at that block.
  it.each(IDS)('fit every block of %s into the real room', (id) => {
    const numbers = real()
    const room = blockRoom({ layout: numbers.adapter, queueSize: numbers.queueSize })
    const blocks = realReplay(id)?.blocks ?? []
    expect(blocks.length > 0, 'the replay has blocks').toBe(true)
    const wide = blocks.filter((block) => packCommands(numbers, block.commands).length > room)
    expect(wide.map((block) => block.name)).toEqual([])
  })

  // Scene: the page and the run scripts refuse a file of another pin or version (U7).
  it("pass the page's check of the pin and the version", () => {
    expect('numbers' in numbersOf(real()), 'the page reads the generated file').toBe(true)
  })

  // Scene: the forfeit and the winner print in the game's window, the same texts as on the
  // invented numbers, and no page runs past the window's lines or width.
  it.each(IDS)('print the texts of %s in pages that fit the real window', (id) => {
    const printed = printedOf(realReplay(id))
    expect(printed.length > 0, 'a block prints').toBe(true)
    const wide = printed.filter(({ print }) => !fits(print, real().textBox))
    expect(wide.map((block) => block.name)).toEqual([])
    expect(textsOf(printed)).toEqual(textsOf(printedOf(replayOn(id, REPLAY_NUMBERS))))
  })

  // Scene: a printed block that sent more than the carrier would stream a line of the game.
  it.each(IDS)('send the carrier alone in each printed block of %s', (id) => {
    const carrier = quietly(() => printedCommand(real()))
    expect(carrier !== undefined, 'the carrier line is found').toBe(true)
    const alone = (block: Printed) =>
      block.commands.length === 1 && isDeepStrictEqual(block.commands[0], carrier)
    expect(
      printedOf(realReplay(id))
        .filter((block) => !alone(block))
        .map(({ name }) => name),
    ).toEqual([])
  })

  // Scene: the run builds the play's plan once it has read the player's adapter.
  it.each(IDS)('build the plan of %s at an adapter address, with the text box', (id) => {
    const numbers = real()
    const replay = realReplay(id)
    expect(replay?.textBox !== undefined, 'the replay carries the text box').toBe(true)
    const plan =
      replay &&
      quietly(() =>
        replayPlan(replay, {
          adapterNumbers: adapterNumbers(numbers),
          table: numbers,
          adapter: ADAPTER,
          pin: numbers.pokebw2.commit,
        }),
      )
    expect(plan !== undefined && plan.length > 0, 'the plan builds').toBe(true)
    const pageWrites = (plan ?? []).flatMap((step) =>
      step.kind === 'write' && step.name.endsWith('-text') ? [step.name] : [],
    )
    expect(pageWrites).toEqual(printedOf(replay).map((block) => `${block.name}-text`))
  })
})
