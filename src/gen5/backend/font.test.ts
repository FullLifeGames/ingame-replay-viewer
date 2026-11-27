import { describe, expect, it } from 'vitest'

import { fitFont, fitName } from './font.ts'

// An invented font: the letters a to z, the digits and "?".
const CHARS = `abcdefghijklmnopqrstuvwxyz0123456789?`

// Scene: a trainer's name holds a letter the battle's font lacks and an emoji above U+FFFF; the
// game would draw "?" for the first, and the second fits no unit of the name buffer.
describe('a name in the battle’s font', () => {
  it('keeps a name the font draws', () => {
    expect(fitFont('abc2158', CHARS)).toEqual({ text: 'abc2158', missing: [] })
  })

  it('puts "?" for each character the font lacks and one above U+FFFF, and names each', () => {
    expect(fitFont('zoé😀z', CHARS)).toEqual({ text: 'zo??z', missing: ['é', '😀'] })
  })
  it('lists each "?" of a name as a fallback at its line', () => {
    expect(fitName('zoé😀', CHARS, { line: 4, what: 'the near trainer’s name' })).toEqual({
      text: 'zo??',
      fallbacks: [
        { line: 4, kind: 'character', detail: 'the near trainer’s name "zoé😀" shows "?" for "é"' },
        {
          line: 4,
          kind: 'character',
          detail: 'the near trainer’s name "zoé😀" shows "?" for "😀"',
        },
      ],
    })
  })
})
