// Knock Off's line when the log names no user: Gen 4 logs `-enditem … [from] move: Knock Off`
// with no `[of]`, so the user is the last mover on the other side (D4).
import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { plain, streamOfLog } from '../testing'

const KNOCKED = '|-enditem|p1a: Dugtrio|Leftovers|[from] move: Knock Off'

/** The PRINTs of the stream's lines from `first` on, with plain spaces. */
const printsFrom = (result: ReturnType<typeof streamOfLog>, first: number) =>
  result.instructions
    .filter(({ line, instruction }) => line >= first && instruction.op === 'print')
    .map(({ instruction }) => plain(instruction))

describe("Knock Off's user without `[of]`", () => {
  it('names the last mover on the other side', () => {
    const result = streamOfLog('|move|p2a: Tyranitar|Knock Off|p1a: Dugtrio', KNOCKED)
    expect(printsFrom(result, NEXT + 1)).toEqual([
      "The opposing Tyranitar knocked off Dugtrio's Leftovers!",
    ])
    expect(result.fallbacks.filter(({ line }) => line === NEXT + 1)).toEqual([])
  })

  it.each([
    ['no move before it', []],
    ['a move by its own side', ['|move|p1a: Dugtrio|Earthquake|p2a: Tyranitar']],
  ])('keeps our wording and its fallback after %s', (_, before) => {
    const result = streamOfLog(...before, KNOCKED)
    const line = NEXT + before.length
    expect(printsFrom(result, line)).toEqual(["Dugtrio's Leftovers was used up!"])
    expect(result.fallbacks.filter((fallback) => fallback.line === line)).toMatchObject([
      { kind: 'phrase', detail: 'no game message for Leftovers used up' },
    ])
  })
})
