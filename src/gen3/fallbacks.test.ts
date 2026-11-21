import { describe, expect, it } from 'vitest'

import { type Fallback, showsInPlace } from './fallbacks'

const fallback = (kind: Fallback['kind']): Fallback => ({ line: 1, kind, detail: 'detail' })

describe('showsInPlace', () => {
  it('holds where the game shows something in place: a phrase, character, form, move, ability or item', () => {
    const kinds = ['phrase', 'character', 'form', 'move', 'ability', 'item'] as const
    expect(kinds.filter((kind) => !showsInPlace(fallback(kind)))).toEqual([])
  })

  it('leaves out a mechanic the stream holds no state for, which shows nothing either way', () => {
    expect(showsInPlace(fallback('mechanic'))).toBe(false)
  })
})
