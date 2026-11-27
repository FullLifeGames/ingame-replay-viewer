// The invented fonts that the font reader's spec hands to it (#106): a few glyphs each, and of
// each glyph only what the reader reads, its character or its code or both. They hold no metric
// and no number of pokebw2. The reader keeps the characters alone, so
// scripts/gen5-fixtures-real.test.ts compares a string.
import type { FontInput } from './gen5-bw2-font.ts'

const font = (glyphs: readonly object[]) => JSON.stringify({ glyphs }, null, 2)

/** Two fonts that share the letters "a", "Z" and "é" and the digit "7"; each draws one character
 * the other lacks. One glyph gives its code alone, one its character and code both. */
export const FONT_INPUT: FontInput = {
  font0: font([
    { char: 'Z' },
    { char: 'a' },
    { code: 'U+0037' },
    { char: '♂' },
    { char: 'é', code: 'U+00E9' },
  ]),
  font2: font([{ char: '7' }, { char: 'é' }, { char: 'a' }, { char: 'Z' }, { char: '~' }]),
}
