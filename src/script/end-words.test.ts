import { describe, expect, it } from 'vitest'

import { tie, won } from './end-words'

// Scene: a replay ends; both game backends print the result in their own text box (#118, D11).
describe('the end words', () => {
  it('name the winner as the Gen 3 viewer does', () => {
    expect(won('abc2158')).toBe('abc2158 won the battle!')
  })

  it('name a tie', () => {
    expect(tie()).toBe('The battle ended in a tie!')
  })
})
