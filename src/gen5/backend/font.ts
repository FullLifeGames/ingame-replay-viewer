// A name in the battle's font (#106, D8): the game draws "?" for a character its fonts lack, so
// the backend writes "?" in its place and lists it. A character above U+FFFF counts as missing:
// the game's text holds one unit per character (src/gen5/game-string.ts), so `nameUnits` never
// meets one. Pure: the font's characters come from build/gen5/bw2.json's `font.chars`.
import type { Gen5Fallback } from './fallbacks.ts'

/** What the game draws in place of a character its font lacks. */
const MISSING = '?'

/** A text as the font draws it, and each character it lacks, in order. */
export interface FontFit {
  text: string
  missing: string[]
}

/** `text` with "?" for each character `chars` lacks or that needs two units. */
export function fitFont(text: string, chars: string): FontFit {
  const missing: string[] = []
  const kept = Array.from(text, (char) => {
    if ((char.codePointAt(0) ?? 0) <= 0xffff && chars.includes(char)) return char
    missing.push(char)
    return MISSING
  })
  return { text: kept.join(''), missing }
}

/** `name` fitted to the font, with a fallback of kind `character` at `line` for each "?"; `what`
 * names the name in the fallback's detail. */
export function fitName(
  name: string,
  chars: string,
  at: { line: number; what: string },
): { text: string; fallbacks: Gen5Fallback[] } {
  const { text, missing } = fitFont(name, chars)
  const fallbacks = missing.map((char) => ({
    line: at.line,
    kind: 'character' as const,
    detail: `${at.what} "${name}" shows "?" for "${char}"`,
  }))
  return { text, fallbacks }
}
