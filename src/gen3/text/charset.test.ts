import { describe, expect, it } from 'vitest'

import { Gen3Error } from '../errors'
import { decodeText, encodeText, fitCharset, splitForPrint } from './charset'

const NBSP = '\u00a0'

describe('encodeText', () => {
  it('spells "The opposing Skarmory used Spikes!" in charmap bytes (C1)', () => {
    // T h e _ o p p o s i n g _ S k a r m o r y _ u s e d _ S p i k e s !
    expect(encodeText('The opposing Skarmory used Spikes!')).toEqual([
      0xce, 0xdc, 0xd9, 0x00, 0xe3, 0xe4, 0xe4, 0xe3, 0xe7, 0xdd, 0xe2, 0xdb, 0x00, 0xcd, 0xdf,
      0xd5, 0xe6, 0xe1, 0xe3, 0xe6, 0xed, 0x00, 0xe9, 0xe7, 0xd9, 0xd8, 0x00, 0xcd, 0xe4, 0xdd,
      0xdf, 0xd9, 0xe7, 0xab,
    ])
  })

  it('writes the no-break space as the charmap NBSP, not as a space (C2)', () => {
    expect(encodeText(`e${NBSP}P`)).toEqual([0xd9, 0x39, 0xca])
    expect(decodeText([0xd9, 0x39, 0xca])).toBe(`e${NBSP}P`)
  })

  it('refuses a character outside the charset', () => {
    expect(() => encodeText('Wobb🦀')).toThrow(Gen3Error)
  })
})

describe('fitCharset', () => {
  it('keeps a text the charset holds, with no fallback', () => {
    expect(fitCharset(`Nidoran♀ and Flabébé${NBSP}…`)).toEqual({
      text: `Nidoran♀ and Flabébé${NBSP}…`,
    })
  })

  it('turns each character outside the charset into ? and names them in one fallback (C3)', () => {
    expect(fitCharset('Wobb🦀 #1🦀')).toEqual({
      text: 'Wobb? ?1?',
      fallback: {
        kind: 'character',
        detail: '"Wobb🦀 #1🦀" has 🦀 # outside the game\'s charset; they show as ?',
      },
    })
    expect(() => encodeText(fitCharset('Wobb🦀').text)).not.toThrow()
  })
})

describe('splitForPrint', () => {
  it('keeps a text that fits one PRINT whole', () => {
    expect(splitForPrint('Bob forfeited.')).toEqual(['Bob forfeited.'])
  })

  it('splits a text over 254 glyphs at the last space that fits', () => {
    const words = Array.from({ length: 60 }, (_, index) => `w${String(index).padStart(3, '0')}`)
    const parts = splitForPrint(words.join(' '))
    expect(parts.join(' ')).toBe(words.join(' '))
    expect(parts.map((part) => encodeText(part).length + 1)).toEqual([255, 45])
  })

  it('cuts a text with no space where it must', () => {
    const parts = splitForPrint('x'.repeat(300))
    expect(parts.map((part) => part.length)).toEqual([254, 46])
  })
})
