import { describe, expect, it } from 'vitest'

import { parseShotArgs } from './rom-shot.ts'

describe('the arguments of rom:shots', () => {
  it('takes none: the hand-made stream and the two refusals', () => {
    expect(() => {
      parseShotArgs([])
    }).not.toThrow()
  })

  it('refuses a replay id while the Gen 3 game backend is missing, and says what runs instead', () => {
    expect(() => {
      parseShotArgs(['994052'])
    }).toThrow(
      'a replay id ("994052") needs the Gen 3 game backend, which is not on this branch yet; npm run rom:shots without an id plays the hand-made stream',
    )
  })

  it('refuses an option it does not know', () => {
    expect(() => {
      parseShotArgs(['--frames'])
    }).toThrow()
  })
})
