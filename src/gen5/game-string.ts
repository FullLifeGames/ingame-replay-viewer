// A name in one of the game's string buffers (#97): the count of its characters where the buffer
// keeps one, the characters and the terminator, each in the buffer's own widths. The game's text
// is Unicode, one unit per character (str_sjis.h's StrUnicodeToSjis reads it so). The room counts
// the terminator, as GFL_StrBufCopyString does, so a buffer of room n holds n - 1 characters. Pure:
// the terminator and the widths come in from build/gen5/bw2.json.
import type { PointerChain } from './ram-chain.ts'
import { littleEndian, type MemoryWrite } from './ram-write.ts'

/** Where a buffer's characters sit, how many it holds with its terminator, and the bytes of one;
 * and where the count of its characters sits, with its bytes, if the buffer keeps one. */
export interface StringBuffer {
  /** The buffer's name in the writes and the log. */
  field: string
  chars: PointerChain
  room: number
  charWidth: number
  length?: PointerChain & { width: number }
}

/** The writes of one name, and the log line of its cut if it did not fit. */
export interface GameString {
  writes: MemoryWrite[]
  cut?: string
}

/** A name's units that fit a buffer's room beside the terminator, and the log line of its cut if
 * it did not fit. */
export interface NameUnits {
  kept: number[]
  cut?: string
}

/** The units of `name`, one per character, cut to `buffer`'s room with the terminator counted;
 * throws on a character that needs two units, is the terminator or is too wide for the buffer. */
export function nameUnits(
  name: string,
  buffer: Pick<StringBuffer, 'field' | 'room' | 'charWidth'>,
  terminator: number,
): NameUnits {
  const { field, room, charWidth } = buffer
  if (room < 2) throw new RangeError(`${field} holds no character beside its terminator`)
  const all = Array.from(name, (char, i) => {
    const unit = char.codePointAt(0) ?? 0
    if (unit > 0xffff || unit === terminator || unit >= 2 ** (8 * charWidth)) {
      throw new RangeError(`${field}: character ${String(i)} of "${name}" does not fit`)
    }
    return unit
  })
  const kept = all.slice(0, room - 1)
  if (kept.length === all.length) return { kept }
  const short = String.fromCodePoint(...kept)
  return {
    kept,
    cut: `${field}: "${name}" cut to "${short}", the ${String(room - 1)} characters it holds`,
  }
}

/** The writes that put `name` into `buffer`, cut to the buffer's room. The count comes first, then
 * the characters with the terminator after them; nothing past the terminator changes. */
export function stringWrites(name: string, buffer: StringBuffer, terminator: number): GameString {
  const { field, charWidth } = buffer
  const { kept, cut } = nameUnits(name, buffer, terminator)
  const chars = [...kept, terminator].flatMap((unit) => littleEndian(unit, charWidth, field))
  const writes: MemoryWrite[] = []
  if (buffer.length) {
    const { width, ...at } = buffer.length
    const bytes = littleEndian(kept.length, width, `${field} length`)
    writes.push({ kind: 'bytes', field: `${field} length`, ...at, bytes })
  }
  writes.push({ kind: 'bytes', field, ...buffer.chars, bytes: chars })
  return cut === undefined ? { writes } : { writes, cut }
}
