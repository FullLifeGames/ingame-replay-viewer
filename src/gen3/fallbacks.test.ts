import { describe, expect, it } from 'vitest'

import { type Fallback, isContentGap } from './fallbacks'

const fallback = (kind: Fallback['kind']): Fallback => ({ line: 1, kind, detail: 'detail' })

describe('isContentGap', () => {
  it('names the content the game lacks: a phrase, character, form, move, ability or item', () => {
    const kinds = ['phrase', 'character', 'form', 'move', 'ability', 'item'] as const
    expect(kinds.filter((kind) => !isContentGap(fallback(kind)))).toEqual([])
  })

  it('leaves out a mechanic the stream holds no state for, which shows nothing either way', () => {
    expect(isContentGap(fallback('mechanic'))).toBe(false)
  })
})
