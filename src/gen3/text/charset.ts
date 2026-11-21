// The game's character set (plan §5): Unicode text to the pinned charmap's bytes and back. The
// codec at the stream seam is strict; `fitCharset` makes text from outside (names, simulator
// messages) fit first and reports what it replaced.
import { Gen3Error } from '../errors'
import charmap from '../tables/charmap.json'

/** The charmap's end of string, which ends and pads every text in the stream. */
export const EOS = charmap.eos

/** The game's no-break space, which keeps a name on one line. */
const NBSP = ' '

function nbspByte(): number {
  const [byte, ...rest] = charmap.named.NBSP
  if (byte === undefined || rest.length > 0) throw new Gen3Error('charmap.json: NBSP is no byte')
  return byte
}

const BYTES: ReadonlyMap<string, number> = new Map([
  [NBSP, nbspByte()],
  ...Object.entries(charmap.chars),
])

// Where several characters share a byte (`’` and `'`), the charmap's first one reads back; NBSP
// goes first, so its byte reads back as NBSP and not as the charmap's `~`.
const CHARS: ReadonlyMap<number, string> = new Map(
  [...BYTES].reverse().map(([char, byte]) => [byte, char]),
)

/** The bytes of `text`, without EOS. */
export function encodeText(text: string): number[] {
  // By code point, so an emoji outside the charset names itself in the error.
  return Array.from(text, (char) => {
    const byte = BYTES.get(char)
    if (byte === undefined) throw new Gen3Error(`"${char}" is not in the game's charset`)
    return byte
  })
}

/** The text of `bytes`, which hold no EOS. */
export function decodeText(bytes: Iterable<number>): string {
  return Array.from(bytes, (byte) => {
    const char = CHARS.get(byte)
    if (char === undefined) throw new Gen3Error(`byte ${String(byte)} is not in the game's charset`)
    return char
  }).join('')
}

/** A text that needed `?` for characters outside the charset. */
export interface CharacterFallback {
  readonly kind: 'character'
  readonly detail: string
}

export interface Fitted {
  readonly text: string
  readonly fallback?: CharacterFallback
}

const REPLACEMENT = '?'

/** `text` with each character outside the charset as `?`, and a fallback naming them. */
export function fitCharset(text: string): Fitted {
  const chars = Array.from(text)
  const outside = [...new Set(chars.filter((char) => !BYTES.has(char)))]
  if (outside.length === 0) return { text }
  const fitted = chars.map((char) => (BYTES.has(char) ? char : REPLACEMENT)).join('')
  const detail = `"${text}" has ${outside.join(' ')} outside the game's charset; they show as ?`
  return { text: fitted, fallback: { kind: 'character', detail } }
}
