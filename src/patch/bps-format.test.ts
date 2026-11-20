import { describe, expect, it } from 'vitest'

import { BpsError, ByteWriter, PatchReader, readUint32 } from './bps-format.ts'

const encode = (value: number) => {
  const writer = new ByteWriter()
  writer.pushNumber(value)
  return [...writer.finish()]
}

describe('BPS numbers', () => {
  it.each([
    [0, [0x80]],
    [1, [0x81]],
    [127, [0xff]],
    [128, [0x00, 0x80]],
    [16511, [0x7f, 0xff]],
    [16512, [0x00, 0x00, 0x80]],
  ])('encodes %i as the spec says', (value, bytes) => {
    expect(encode(value)).toEqual(bytes)
  })

  it.each([0, 1, 127, 128, 16512, 33554432, 2 ** 40 + 5])('decodes %i back', (value) => {
    const bytes = new Uint8Array(encode(value))
    const reader = new PatchReader(bytes, bytes.length)
    expect(reader.number()).toBe(value)
    expect(reader.offset).toBe(bytes.length)
  })

  it('refuses a number that runs past the end of its area', () => {
    const bytes = new Uint8Array([0x00, 0x00, 0x80])
    const reader = new PatchReader(bytes, 2)
    expect(() => reader.number()).toThrow(BpsError)
    expect(() => new PatchReader(bytes, 2).number()).toThrow(/number runs past the end/)
  })

  it('refuses a number above 2^53', () => {
    const bytes = new Uint8Array(new Array<number>(9).fill(0x7f).concat([0xff]))
    expect(() => new PatchReader(bytes, bytes.length).number()).toThrow(/number too large/)
  })

  it('refuses to encode a negative or fractional number', () => {
    expect(() => encode(-1)).toThrow(/not a size/)
    expect(() => encode(1.5)).toThrow(/not a size/)
  })
})

describe('ByteWriter', () => {
  it('grows past its first buffer and keeps every byte', () => {
    const writer = new ByteWriter()
    const block = new Uint8Array(100_000).map((_, index) => index & 0xff)
    writer.pushBytes(block)
    for (let index = 0; index < 70_000; index++) writer.pushByte(index & 0xff)
    expect(writer.length).toBe(170_000)
    const bytes = writer.finish()
    expect(bytes.subarray(0, 100_000)).toEqual(block)
    expect(bytes[169_999]).toBe(69_999 & 0xff)
  })

  it('writes 32-bit values little-endian and reads them back', () => {
    const writer = new ByteWriter()
    writer.pushUint32(0xcbf43926)
    const bytes = writer.finish()
    expect([...bytes]).toEqual([0x26, 0x39, 0xf4, 0xcb])
    expect(readUint32(bytes, 0)).toBe(0xcbf43926)
  })
})

describe('PatchReader.take', () => {
  it('returns the bytes and moves on', () => {
    const reader = new PatchReader(new Uint8Array([1, 2, 3, 4]), 4)
    expect([...reader.take(3)]).toEqual([1, 2, 3])
    expect(reader.offset).toBe(3)
  })

  it('refuses to read past the end of its area', () => {
    const reader = new PatchReader(new Uint8Array([1, 2, 3, 4]), 2)
    expect(() => reader.take(3)).toThrow(/runs past the end/)
  })
})
