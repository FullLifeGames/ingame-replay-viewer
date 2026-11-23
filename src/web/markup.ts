// Showdown's HTML in a battle log line (a `|raw|` line, a chat line with `/raw`) as plain text
// for the "Not shown in the game" list (#31). The result is text for `textContent`, never for
// `innerHTML`: a reference that decodes to "<" stays a character and never becomes a tag.

// A tag needs a letter after "<", so "<3" and "a < b" stay. `[^<>]*` stops at the next "<",
// so a line of unclosed tags costs one pass, not one pass per "<".
const TAG = /<\/?[A-Za-z][^<>]*>/g

// One pass over the line, so "&amp;lt;" becomes "&lt;" and never "<". The digit counts keep
// every number within the code point range's reach.
const REFERENCE = /&(?:#([0-9]{1,7})|#[xX]([0-9A-Fa-f]{1,6})|([A-Za-z][A-Za-z0-9]{0,31}));/g

const NAMED: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
  ['rarr', '→'],
  ['larr', '←'],
])

const LAST_CODE_POINT = 0x10ffff
const isSurrogate = (codePoint: number) => codePoint >= 0xd800 && codePoint <= 0xdfff

function character(codePoint: number): string | undefined {
  if (codePoint === 0 || codePoint > LAST_CODE_POINT || isSurrogate(codePoint)) return undefined
  return String.fromCodePoint(codePoint)
}

function decode(
  reference: string,
  decimal: string | undefined,
  hex: string | undefined,
  name: string | undefined,
): string {
  const decoded =
    decimal !== undefined
      ? character(Number.parseInt(decimal, 10))
      : hex !== undefined
        ? character(Number.parseInt(hex, 16))
        : NAMED.get(name ?? '')
  return decoded ?? reference
}

/** `html` without its tags and with its references decoded; an unknown reference stays. */
export function plainText(html: string): string {
  return html.replace(TAG, ' ').replace(/\s+/g, ' ').trim().replace(REFERENCE, decode)
}
