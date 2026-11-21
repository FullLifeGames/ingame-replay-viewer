// The game's character set (plan §5): Unicode text to the pinned charmap's bytes and back. This
// is the strict codec at the stream seam; a character outside the charmap is an error here.
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
