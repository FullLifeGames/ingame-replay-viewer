import { describe, expect, it } from 'vitest'

import { readHeader, readStreamsInfo } from './seven-zip-header'
import { ByteReader } from './seven-zip-reader'
import { crcBytes } from './seven-zip.fixtures'

const reader = (bytes: number[]) => new ByteReader(Uint8Array.from(bytes))

/** Coders info for folders of one LZMA2 coder (property 0x15) each, unpacking to `sizes`. */
const lzma2Folders = (sizes: number[]) => [
  0x07,
  0x0b,
  sizes.length,
  0x00,
  ...sizes.flatMap(() => [0x01, 0x21, 0x21, 0x01, 0x15]),
  0x0c,
  ...sizes,
]

describe('ByteReader', () => {
  // Scene: 7z's numbers take one to nine bytes, the first byte's leading ones counting the rest.
  it('reads numbers of every length', () => {
    expect(reader([0x05]).number()).toBe(5)
    expect(reader([0x81, 0x02]).number()).toBe(0x102)
    expect(reader([0xc1, 0x34, 0x12]).number()).toBe(0x11234)
    expect(reader([0xfe, 1, 0, 0, 0, 0, 0, 0]).number()).toBe(1)
    expect(reader([0xff, 2, 0, 0, 0, 0, 0, 0, 0]).number()).toBe(2)
  })

  it('refuses a number past what it reads', () => {
    expect(() => reader([0xff, ...new Array<number>(8).fill(0xff)]).number()).toThrow(
      'The 7z header holds a number past what this unpacker reads.',
    )
  })

  it('refuses to read past its end', () => {
    expect(() => reader([1, 2]).take(3)).toThrow('The 7z header ends early.')
  })

  it('reads CRCs for the defined items alone', () => {
    const bytes = [0x00, 0b10100000, ...crcBytes(0x11223344), ...crcBytes(0x55667788)]
    expect(reader(bytes).digests(3)).toEqual([0x11223344, undefined, 0x55667788])
  })
})

describe('readStreamsInfo', () => {
  it('reads the packed streams with their CRCs', () => {
    const info = readStreamsInfo(
      reader([0x06, 0x03, 0x01, 0x09, 0x05, 0x0a, 0x01, 1, 0, 0, 0, 0, 0]),
    )
    expect(info).toMatchObject({ packPos: 3, packSizes: [5], packCrcs: [1], folders: [] })
  })

  it('reads a coder that names its one input and output', () => {
    const coder = [0x07, 0x0b, 0x01, 0x00, 0x01, 0x31, 0x21, 0x01, 0x01, 0x01, 0x15, 0x0c, 0x05]
    const info = readStreamsInfo(reader([...coder, 0x00, 0x00]))
    expect(info.folders).toEqual([
      { coder: { id: '21', properties: Uint8Array.of(0x15) }, size: 5, crc: undefined },
    ])
  })

  it('gives each sub-stream its CRC from the folder or from the list', () => {
    const folders = [...lzma2Folders([5, 6]), 0x0a, 0x00, 0b10000000, ...crcBytes(7), 0x00]
    const sub = [0x08, 0x0d, 0x01, 0x02, 0x09, 0x02, 0x0a, 0x01, ...crcBytes(8), ...crcBytes(9)]
    const info = readStreamsInfo(reader([...folders, ...sub, 0x00, 0x00]))
    expect(info.streams).toEqual([
      [{ size: 5, crc: 7 }],
      [
        { size: 2, crc: 8 },
        { size: 4, crc: 9 },
      ],
    ])
  })

  it('gives a folder of no sub-streams none', () => {
    const info = readStreamsInfo(reader([...lzma2Folders([5]), 0x00, 0x08, 0x0d, 0x00, 0x00, 0x00]))
    expect(info.streams).toEqual([[]])
  })

  // Scene: what breaks the layout throws a sentence that says where.
  it('refuses a property where the packed streams end', () => {
    expect(() => readStreamsInfo(reader([0x06, 0x00, 0x01, 0x09, 0x05, 0x22]))).toThrow(
      'The 7z header holds the property 0x22 where it reads the packed streams.',
    )
  })

  it('refuses coders info without its folders', () => {
    expect(() => readStreamsInfo(reader([0x07, 0x0c]))).toThrow(
      'The 7z header holds the property 0x0c where it reads the folders.',
    )
  })

  it('refuses folders without their sizes', () => {
    expect(() => readStreamsInfo(reader([0x07, 0x0b, 0x01, 0x00, 0x01, 0x01, 0x21, 0x0a]))).toThrow(
      'The 7z header holds the property 0x0a where it reads the folders.',
    )
  })

  it('refuses a coder of more than one input', () => {
    expect(() => readStreamsInfo(reader([0x07, 0x0b, 0x01, 0x00, 0x01, 0x11, 0x21, 2, 1]))).toThrow(
      'The 7z archive holds a coder LZMA2 with 2 inputs and 1 outputs; this unpacker reads coders of one each.',
    )
  })

  // Scene: 7zFormat.txt keeps a coder's top flag bit, more alternative methods, at 0 (review U2).
  it("refuses a coder's flag for alternative methods by name", () => {
    const coder = [0x07, 0x0b, 0x01, 0x00, 0x01, 0xa1, 0x21, 0x01, 0x15, 0x0c, 0x05, 0x00, 0x00]
    expect(() => readStreamsInfo(reader(coder))).toThrow(
      'The 7z archive holds a coder LZMA2 with the flag for alternative methods, which the format no longer uses.',
    )
  })

  it('refuses a folder split without sizes', () => {
    const bytes = [...lzma2Folders([10]), 0x00, 0x08, 0x0d, 0x02, 0x00, 0x00]
    expect(() => readStreamsInfo(reader(bytes))).toThrow(
      'The 7z header splits a folder without its sizes.',
    )
  })

  it('refuses sub-streams that outgrow their folder', () => {
    const bytes = [...lzma2Folders([10]), 0x00, 0x08, 0x0d, 0x02, 0x09, 20, 0x00, 0x00]
    expect(() => readStreamsInfo(reader(bytes))).toThrow(
      "The 7z header's sub-streams outgrow their folder.",
    )
  })
})

describe('readHeader', () => {
  it('passes over the archive properties', () => {
    expect(readHeader(reader([0x02, 0x05, 0x01, 0xaa, 0x00, 0x00]))).toEqual({
      main: undefined,
      files: [],
    })
  })

  it('refuses names kept outside the header', () => {
    expect(() => readHeader(reader([0x05, 0x01, 0x11, 0x02, 0x01, 0x00, 0x00, 0x00]))).toThrow(
      'The 7z header keeps its names outside itself.',
    )
  })

  it('refuses files without a name each', () => {
    const names = [0x11, 0x05, 0x00, 0x61, 0x00, 0x00, 0x00]
    expect(() => readHeader(reader([0x05, 0x02, ...names, 0x00, 0x00]))).toThrow(
      'The 7z header names 1 of its 2 files.',
    )
  })

  it('refuses a property after the files', () => {
    expect(() => readHeader(reader([0x05, 0x00, 0x00, 0x07]))).toThrow(
      'The 7z header holds the property 0x07 where it reads the header.',
    )
  })
})
