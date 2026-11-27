import { describe, expect, it } from 'vitest'

import { fontChars, fontNumbers } from './gen5-bw2-font'
import { FONT_INPUT } from './gen5-bw2-font.fixtures'

// The reader's invented fonts are in gen5-bw2-font.fixtures.ts.
const glyphs = (...list: object[]) => JSON.stringify({ glyphs: list })

// Scene: a trainer's name or a nickname holds a character the battle's fonts cannot draw, and the
// backend must know it before the game draws "?" for it.
describe('fontNumbers', () => {
  it('gives the characters both battle fonts draw, in the order of their codes', () => {
    expect(fontNumbers(FONT_INPUT)).toEqual({ chars: '7Zaé' })
  })
})

describe('fontChars', () => {
  it("takes each glyph's character, or the character of its code", () => {
    expect([...fontChars(FONT_INPUT.font0, 'font0')].sort()).toEqual(['7', 'Z', 'a', 'é', '♂'])
  })

  it('refuses a glyph that names no character, by its font', () => {
    expect(() => fontChars(glyphs({ left: 0, width: 1, advance: 2 }), 'font2')).toThrow(
      /font2: a glyph names neither a char nor a code/,
    )
  })

  it("refuses a glyph whose character is not its code's, or is no single character", () => {
    expect(() => fontChars(glyphs({ char: 'a', code: 'U+0062' }), 'font0')).toThrow(/font0.*"a"/)
    expect(() => fontChars(glyphs({ char: 'ab' }), 'font0')).toThrow(/font0.*"ab"/)
    expect(() => fontChars(glyphs({ code: '0062' }), 'font0')).toThrow(/font0.*"0062"/)
  })

  it('refuses a font without its list of glyphs', () => {
    expect(() => fontChars(JSON.stringify({ maps: [] }), 'font0')).toThrow(/font0 has no glyphs/)
  })
})
