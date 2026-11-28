import { describe, expect, it } from 'vitest'

import { REPLAY_NUMBERS } from './backend/replay.fixtures.ts'
import { chainAddress } from './ram-chain.ts'
import { failingCheck, type ReadRam } from './ram-check.ts'
import { type MemoryWrite, wordWrites } from './ram-write.ts'
import { armWrites, formattedCheck, pageWrites, TEXT_LIMIT, textBox } from './text-box.ts'

// Invented numbers: the backend's text box fixture and a heap of our own. The chain runs from the
// string work's main module to the view core and on to the core's StrBuf.
const BOX = REPLAY_NUMBERS.textBox
const MODULE = 0x02110000
const CORE = 0x02120000
const STRBUF = 0x02130000
const { CHAR_EOM, CHAR_NEWLINE, STRBUF_MAGIC } = BOX.constants
const at = (member: string) => STRBUF + (BOX.strBuf.fields[member]?.offset ?? NaN)

/** A main RAM of bytes with the chain in place and the core's StrBuf valid and empty. */
function fakeRam() {
  const bytes = new Map<number, number>()
  const put = (address: number, value: number, width: number) => {
    for (let i = 0; i < width; i += 1) bytes.set(address + i, Math.floor(value / 256 ** i) % 256)
  }
  const read: ReadRam = (address, width) => {
    let value = 0
    for (let i = width - 1; i >= 0; i -= 1) value = value * 256 + (bytes.get(address + i) ?? 0)
    return value
  }
  const apply = (writes: readonly MemoryWrite[]) => {
    for (const write of writes) {
      const words = wordWrites(write, (address) => read(address, 4))
      if ('fault' in words) throw new Error(words.fault)
      for (const word of words.words) put(word.address, word.value, 4)
    }
  }
  put(BOX.stringWork.address + BOX.mainModule, MODULE, 4)
  put(MODULE + BOX.viewCore, CORE, 4)
  put(CORE + BOX.strbuf, STRBUF, 4)
  put(at('magic'), STRBUF_MAGIC, 4)
  put(at('size'), BOX.room, 4)
  put(at('chars'), CHAR_EOM, 2)
  return { read, put, apply }
}

/** The characters from `chars` on up to the terminator, and the terminator's place. */
function textAt(read: ReadRam) {
  const units: number[] = []
  for (let i = 0; read(at('chars') + 2 * i, 2) !== CHAR_EOM; i += 1) {
    units.push(read(at('chars') + 2 * i, 2))
  }
  return String.fromCharCode(...units)
}

// Scene: the page finds the window's buffer through pointers the battle set up, so a write lands
// in the buffer the stream reads and nowhere else.
describe('textBox', () => {
  it('reaches the StrBuf’s characters and length through the chain', () => {
    const { read } = fakeRam()
    const { buffer } = textBox(BOX)
    const word = (address: number) => read(address, 4)
    expect(chainAddress('chars', buffer.chars, 2, word)).toEqual({ address: at('chars') })
    if (!buffer.length) throw new Error('the box keeps no length')
    expect(chainAddress('length', buffer.length, 4, word)).toEqual({ address: at('length') })
    expect(buffer).toMatchObject({ field: 'core.strbuf', room: BOX.room, charWidth: 2 })
  })

  it('holds its guard on a valid StrBuf of the core’s size', () => {
    expect(failingCheck(textBox(BOX).guard, fakeRam().read)).toBeUndefined()
  })

  it('fails its guard by name on a wrong magic, a wrong size and a hop out of main RAM', () => {
    const { guard } = textBox(BOX)
    const magic = fakeRam()
    magic.put(at('magic'), 0x1234, 4)
    expect(failingCheck(guard, magic.read)).toMatch(/^strbuf\.magic read 0x1234, not one of/)
    const size = fakeRam()
    size.put(at('size'), BOX.room - 1, 4)
    expect(failingCheck(guard, size.read)).toMatch(/^strbuf\.size read/)
    const hop = fakeRam()
    hop.put(MODULE + BOX.viewCore, 0, 4)
    expect(failingCheck(guard, hop.read)).toBe(
      'mainModule.viewCore read 0x0, not a pointer into main RAM',
    )
  })

  it('refuses a StrBuf with no magic, or a member no check can read, by name', () => {
    const fields = Object.fromEntries(
      Object.entries(BOX.strBuf.fields).filter(([name]) => name !== 'magic'),
    )
    expect(() => textBox({ ...BOX, strBuf: { ...BOX.strBuf, fields } })).toThrow(
      'StrBuf has no magic',
    )
    const wide = { ...fields, magic: { offset: 8, size: 3 } }
    expect(() => textBox({ ...BOX, strBuf: { ...BOX.strBuf, fields: wide } })).toThrow(
      'StrBuf.magic takes 3 bytes',
    )
  })
})

// Scene: before the carrier's block the page empties the buffer, so the client's format is the
// one thing that can fill its first character.
describe('armWrites and formattedCheck', () => {
  it('arm the buffer to length 0 and the terminator first', () => {
    const ram = fakeRam()
    ram.apply(pageWrites(BOX, 'Old'))
    ram.apply(armWrites(BOX))
    expect(ram.read(at('length'), 4)).toBe(0)
    expect(ram.read(at('chars'), 2)).toBe(CHAR_EOM)
  })

  it('fails by name while the buffer is armed and holds once the client formatted a line', () => {
    const ram = fakeRam()
    ram.apply(armWrites(BOX))
    expect(failingCheck([formattedCheck(BOX)], ram.read)).toMatch(/^strbuf\.chars\[0\] read/)
    ram.put(at('chars'), 'B'.charCodeAt(0), 2)
    expect(failingCheck([formattedCheck(BOX)], ram.read)).toBeUndefined()
  })

  it('give the client 120 frames to format the carrier', () => {
    expect(TEXT_LIMIT).toBe(120)
  })
})

// Scene: the forfeit's page lands in the buffer over the carrier, in the game's encoding.
describe('pageWrites', () => {
  it('writes the units, the line break between lines, the terminator and the length', () => {
    const ram = fakeRam()
    ram.apply(pageWrites(BOX, 'Rain falls\non and on.'))
    const newline = String.fromCharCode(CHAR_NEWLINE)
    expect(textAt(ram.read)).toBe(`Rain falls${newline}on and on.`)
    expect(ram.read(at('length'), 4)).toBe(21)
    expect(ram.read(at('chars') + 2 * 22, 2)).toBe(0)
  })

  it('throws by the buffer’s name on a page past its room', () => {
    expect(() => pageWrites(BOX, 'x'.repeat(BOX.room))).toThrow(/^core\.strbuf: "x+" cut to/)
  })
})
