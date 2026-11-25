// Items whose lines Gen 4 logs brought: Custap Berry's `[consumed]` after the berry is eaten
// (`BattleScript_CustapBerryActivation`) and Quick Claw's activation.
import { describe, expect, it } from 'vitest'

import { NEXT } from '../../script/testing'
import { itemOf } from '../tables/lookup'
import { plain, streamOfLog } from '../testing'

const EATEN = '|-enditem|p2a: Tyranitar|Custap Berry|[eat]'
const CONSUMED = '|-activate|p2a: Tyranitar|item: Custap Berry|[consumed]'

/** The instructions of the log lines from `first` on, with plain spaces, without the END. */
const sceneFrom = (result: ReturnType<typeof streamOfLog>, first: number) =>
  result.instructions
    .filter(({ line, instruction }) => line >= first && instruction.op !== 'end')
    .map(({ instruction }) => plain(instruction))

const fallbacksFrom = (result: ReturnType<typeof streamOfLog>, first: number) =>
  result.fallbacks.filter(({ line }) => line >= first)

describe('Custap Berry', () => {
  it('shows the eaten berry, plays it, then says the holder acts faster', () => {
    const result = streamOfLog(EATEN, CONSUMED)
    expect(sceneFrom(result, NEXT)).toEqual([
      { op: 'itemPopUp', side: 'far', item: itemOf('Custap Berry').number },
      { op: 'anim', side: 'far', anim: 'heldItemBerry' },
      { op: 'item', side: 'far', slot: 0, item: 0 },
      'The opposing Tyranitar can act faster than normal, thanks to its Custap Berry!',
    ])
    expect(fallbacksFrom(result, NEXT)).toEqual([])
  })

  it('keeps our wording and its fallback for a `[consumed]` line with no berry eaten before', () => {
    const result = streamOfLog(CONSUMED)
    expect(fallbacksFrom(result, NEXT)).toMatchObject([
      { kind: 'phrase', detail: 'no game message for Custap Berry acting' },
    ])
  })
})

describe('Quick Claw (D8)', () => {
  it('keeps our wording and its fallback', () => {
    const result = streamOfLog('|-activate|p2a: Tyranitar|item: Quick Claw')
    expect(fallbacksFrom(result, NEXT)).toMatchObject([
      { kind: 'phrase', detail: 'no game message for Quick Claw acting' },
    ])
  })
})
