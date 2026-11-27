// The characters the battle's fonts draw (#106), from pokebw2 at its pin: the battle view creates
// fonts 0 and 2 of the font archive (BtlvCore's init in btlv_core.c), and the game draws "?" for a
// character a font lacks (res/fonts/font.schema.json). Each glyph names its character, or its code
// where the character does not print. Part of build/gen5/bw2.json as a string, which holds no
// number of pokebw2; the errors name the font and the glyph's text and show no number.
import type { FontNumbers } from '../src/gen5/bw2-numbers.ts'

/** The two fonts the battle view draws with, by role. */
export const FONT_SOURCES = {
  font0: 'res/fonts/font/00/font.json',
  font2: 'res/fonts/font/02/font.json',
}

/** The texts of FONT_SOURCES by role. */
export type FontInput = Record<keyof typeof FONT_SOURCES, string>

interface Glyph {
  char?: unknown
  code?: unknown
}

const CODE = /^U\+[0-9A-F]{4}$/

/** The character of a glyph's code, if it gives one; throws on a code of another shape. */
function codeChar(code: unknown, font: string): string | undefined {
  if (code === undefined) return undefined
  if (typeof code !== 'string' || !CODE.test(code)) {
    throw new Error(`${font}: the glyph code ${JSON.stringify(code)} is no U+XXXX`)
  }
  return String.fromCharCode(Number.parseInt(code.slice(2), 16))
}

/** The one character a glyph draws, a UTF-16 unit as the fonts encode it; throws by the font's
 * role on any other shape. */
function glyphChar(glyph: Glyph, font: string): string {
  const fromCode = codeChar(glyph.code, font)
  const drawn = glyph.char ?? fromCode
  if (drawn === undefined) throw new Error(`${font}: a glyph names neither a char nor a code`)
  if (typeof drawn !== 'string' || drawn.length !== 1 || (fromCode ?? drawn) !== drawn) {
    const char = JSON.stringify(glyph.char)
    throw new Error(`${font}: the glyph ${char} is not the one character of its code`)
  }
  return drawn
}

/** The characters a font's glyphs draw. */
export function fontChars(json: string, font: string): Set<string> {
  const { glyphs } = JSON.parse(json) as { glyphs?: unknown }
  if (!Array.isArray(glyphs)) throw new Error(`${font} has no glyphs`)
  return new Set((glyphs as Glyph[]).map((glyph) => glyphChar(glyph, font)))
}

/** The characters both battle fonts draw, in the order of their codes. */
export function fontNumbers(input: FontInput): FontNumbers {
  const drawn = (Object.keys(FONT_SOURCES) as (keyof FontInput)[]).map((font) =>
    fontChars(input[font], font),
  )
  const [first = new Set<string>(), ...rest] = drawn
  const both = [...first].filter((char) => rest.every((set) => set.has(char)))
  const code = (char: string) => char.codePointAt(0) ?? 0
  return { chars: both.sort((a, b) => code(a) - code(b)).join('') }
}
