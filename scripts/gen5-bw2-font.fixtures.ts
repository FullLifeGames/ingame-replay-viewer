// The invented fonts that the font reader's spec hands to it (#106): a few glyphs each, with
// metrics made up for it and none copied from pokebw2. The reader keeps the characters alone, so
// scripts/gen5-fixtures-real.test.ts compares a string, which holds no number.
import type { FontInput } from './gen5-bw2-font.ts'

const font = (glyphs: readonly object[]) =>
  JSON.stringify({ encoding: 'UTF-16', bpp: 2, glyphs }, null, 2)

/** Two fonts that share the letters "a", "Z" and "é" and the digit "7"; each draws one character
 * the other lacks. One glyph gives its code alone, one its character and code both. */
export const FONT_INPUT: FontInput = {
  font0: font([
    { char: 'Z', left: 1, width: 7, advance: 9 },
    { char: 'a', left: 0, width: 5, advance: 6 },
    { code: 'U+0037', left: 2, width: 4, advance: 7 },
    { char: '♂', left: 1, width: 8, advance: 10 },
    { char: 'é', code: 'U+00E9', left: 0, width: 5, advance: 6 },
  ]),
  font2: font([
    { char: '7', left: 1, width: 3, advance: 5 },
    { char: 'é', left: 1, width: 4, advance: 5 },
    { char: 'a', left: 1, width: 4, advance: 5 },
    { char: 'Z', left: 0, width: 6, advance: 7 },
    { char: '~', left: 2, width: 5, advance: 8 },
  ]),
}
