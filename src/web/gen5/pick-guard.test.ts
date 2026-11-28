import { describe, expect, it } from 'vitest'

import { guardPick, pickFailedLine } from './pick-guard'

// Scene: the visitor picks a dump and something in the page's own code throws on the way to the
// game, so the status line must say so instead of staying at "Loading <label>.".
describe('guardPick', () => {
  it('says a throw as a sentence', async () => {
    const said: string[] = []
    await guardPick(
      () => Promise.reject(new Error("a fallback points at line 9, past the battle log's end")),
      (line) => said.push(line),
    )
    expect(said).toEqual([
      "The page stopped before the game started: a fallback points at line 9, past the battle log's end",
    ])
  })

  it('says a thrown value that is no Error', async () => {
    const said: string[] = []
    await guardPick(
      async () => {
        await Promise.resolve()
        const value: unknown = 'no file'
        throw value
      },
      (line) => said.push(line),
    )
    expect(said).toEqual(['The page stopped before the game started: no file'])
  })

  it('says nothing more when the pick went through', async () => {
    const said: string[] = []
    await guardPick(
      () => Promise.resolve(),
      (line) => said.push(line),
    )
    expect(said).toEqual([])
  })

  it('pins the sentence whole', () => {
    expect(pickFailedLine(new TypeError('network error'))).toBe(
      'The page stopped before the game started: network error',
    )
  })
})
