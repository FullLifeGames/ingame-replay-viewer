// The text box of Black 2's battle view (#118): a line Black 2 lacks prints in the game's own
// window. A printed block sends one standard line of the game, the carrier, and the page writes
// our text into the string buffer the window streams from before the stream reads it. The
// generator (scripts/gen5-bw2-textbox.ts) checks the carrier against the pinned pokebw2.
import type { TextBoxNumbers } from './bw2-numbers.ts'
import { type StringBuffer, stringWrites } from './game-string.ts'
import type { PointerChain } from './ram-chain.ts'
import type { RamCheck } from './ram-check.ts'
import type { MemoryWrite } from './ram-write.ts'

/** The carrier: a neutral line of the standard bank with no command and no side's variant, so a
 * write that ever missed would show the game's own "nothing happened" and no wrong words. */
export const TEXT_BOX_CARRIER = 'Bank0019_Text_ButNothingHappened'

/** Frames the client may take to format the carrier; it takes a block within a few (lane plan
 * D12). A miss fails the block's `-text` wait by its name. */
export const TEXT_LIMIT = 120

/** The core's StrBuf as a string buffer behind the chain, and the checks that the chain leads to a
 * valid StrBuf of the core's size. */
export interface TextBox {
  buffer: StringBuffer
  guard: RamCheck[]
}

/** The buffer's name in the writes and the log. */
const FIELD = 'core.strbuf'

/** A StrBuf member's offset and width; throws by name on a member it lacks or one no check can
 * read. */
function member(numbers: TextBoxNumbers, name: string): { offset: number; width: 1 | 2 | 4 } {
  const field = numbers.strBuf.fields[name]
  if (field === undefined) throw new Error(`StrBuf has no ${name}`)
  const { offset, size } = field
  if (size !== 1 && size !== 2 && size !== 4) {
    throw new Error(`StrBuf.${name} takes ${String(size)} bytes, no width a check reads`)
  }
  return { offset, width: size }
}

/** The chain from the string work's main module to the core's StrBuf, ending at `hops`. */
function chain(numbers: TextBoxNumbers, ...hops: number[]): PointerChain & { hops: number[] } {
  return { address: numbers.stringWork.address + numbers.mainModule, hops }
}

/** The chain to a member of the core's StrBuf, with its width. */
function memberRef(numbers: TextBoxNumbers, name: string) {
  const { offset, width } = member(numbers, name)
  return { ...chain(numbers, numbers.viewCore, numbers.strbuf, offset), width }
}

/** The core's StrBuf behind `sWork + mainModule → viewCore → strbuf`, and its guard: each hop a
 * pointer into main RAM, the magic of a valid StrBuf and the size BtlvCore_Create gives it. */
export function textBox(numbers: TextBoxNumbers): TextBox {
  const { STRBUF_MAGIC } = numbers.constants
  const { viewCore, strbuf, room } = numbers
  const chars = memberRef(numbers, 'chars')
  const length = memberRef(numbers, 'length')
  const buffer: StringBuffer = {
    field: FIELD,
    chars: { address: chars.address, hops: chars.hops },
    room,
    charWidth: chars.width,
    length,
  }
  const pointer = (name: string, hops: number[]): RamCheck => ({
    name,
    ...chain(numbers, ...hops),
    width: 4,
    mainRamPointer: true,
  })
  const guard: RamCheck[] = [
    pointer('sWork.mainModule', []),
    pointer('mainModule.viewCore', [viewCore]),
    pointer('viewCore.strbuf', [viewCore, strbuf]),
    { name: 'strbuf.magic', ...memberRef(numbers, 'magic'), oneOf: [STRBUF_MAGIC] },
    { name: 'strbuf.size', ...memberRef(numbers, 'size'), oneOf: [room] },
  ]
  return { buffer, guard }
}

/** The arm: `length` 0 and the terminator at `chars[0]`, written with the carrier's block. */
export function armWrites(numbers: TextBoxNumbers): MemoryWrite[] {
  return pageWrites(numbers, '')
}

/** The client formatted a line into the buffer: `chars[0]` is no longer the terminator. */
export function formattedCheck(numbers: TextBoxNumbers): RamCheck {
  const { CHAR_EOM } = numbers.constants
  return { name: 'strbuf.chars[0]', ...memberRef(numbers, 'chars'), noneOf: [CHAR_EOM] }
}

/** A page's writes: its lines ("\n" between them) with CHAR_NEWLINE between, the terminator after
 * and the length; throws by the buffer's name on a page past its room. */
export function pageWrites(numbers: TextBoxNumbers, page: string): MemoryWrite[] {
  const { CHAR_EOM, CHAR_NEWLINE } = numbers.constants
  const text = page.replaceAll('\n', String.fromCharCode(CHAR_NEWLINE))
  const { writes, cut } = stringWrites(text, textBox(numbers).buffer, CHAR_EOM)
  if (cut !== undefined) throw new RangeError(cut)
  return writes
}
