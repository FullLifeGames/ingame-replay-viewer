import { describe, expect, it } from 'vitest'

import type { Gen5Fallback } from './fallbacks.ts'
import { notShown } from './not-shown.ts'

// Scene: a run's log and the replay spec list what of a replay the game does not show, counted
// by the fallback's kind, then by the event's kind.
describe('notShown', () => {
  it('counts each fallback by kind, then by event, and the party’s under party', () => {
    const fallbacks: Gen5Fallback[] = [
      { line: 3, kind: 'form', detail: 'Thundurus-Therian is written as Thundurus' },
      { line: 4, kind: 'character', detail: 'é shows as ?' },
      { line: 10, kind: 'unplayed', event: 'hitCount', detail: 'Black 2 does not play this yet' },
      { line: 11, kind: 'unplayed', event: 'hitCount', detail: 'Black 2 does not play this yet' },
      { line: 12, kind: 'unplayed', event: 'ohko', detail: 'Black 2 does not play this yet' },
      { line: 13, kind: 'line', event: 'message', detail: 'Black 2 has no such line' },
      { line: 14, kind: 'plain', event: 'switchIn', detail: 'plays as a plain switch: Baton Pass' },
    ]
    expect(notShown(fallbacks)).toEqual({
      form: { party: 1 },
      character: { party: 1 },
      unplayed: { hitCount: 2, ohko: 1 },
      line: { message: 1 },
      plain: { switchIn: 1 },
    })
  })

  it('gives an empty list for a replay the game shows whole', () => {
    expect(notShown([])).toEqual({})
  })
})
