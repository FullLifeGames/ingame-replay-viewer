import { describe, expect, it } from 'vitest'

import { crc32 } from '../patch/crc32'
import { fromBase64, LZMA_STREAMS, OTHER_PHRASE, seededBytes, textBytes } from './lzma.fixtures'
import { unpack7z } from './seven-zip'
import { ARCHIVES, build, crcBytes, headerOnly } from './seven-zip.fixtures'

const archive = (name: keyof typeof ARCHIVES) => fromBase64(ARCHIVES[name])

const ascii = (text: string) => new TextEncoder().encode(text)

/** The archive with its header's CRC and the start header's CRC made right again. */
function resigned(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset)
  const from = 32 + view.getUint32(12, true)
  view.setUint32(28, crc32(bytes.subarray(from, from + view.getUint32(20, true))), true)
  view.setUint32(8, crc32(bytes.subarray(12, 32)), true)
  return bytes
}

/** The LZMA2 stream of textBytes(3000), 75 bytes. */
const TEXT = fromBase64(LZMA_STREAMS.text)

/** The header of one folder that unpacks TEXT, `files` after its coders info: the 7z number for
 * 3000 is 0x8b 0xb8. */
const textHeader = (folderCrc: number[], subStreams: number[], files: number[]) => [
  0x01,
  ...[0x04, 0x06, 0x00, 0x01, 0x09, TEXT.length, 0x00],
  ...[0x07, 0x0b, 0x01, 0x00, 0x01, 0x21, 0x21, 0x01, 0x10, 0x0c, 0x8b, 0xb8, ...folderCrc, 0x00],
  ...subStreams,
  0x00,
  ...files,
  0x00,
]

/** Files info for files with data named a and b. */
const filesAB = [0x05, 0x02, 0x11, 0x09, 0x00, 0x61, 0x00, 0x00, 0x00, 0x62, 0x00, 0x00, 0x00, 0x00]

/** Main streams of one folder with one coder `coder` (its first byte, id and properties). */
const oneFolder = (coder: number[]) => [0x04, 0x07, 0x0b, 0x01, 0x00, 0x01, ...coder, 0x0c, 0x01]

describe('unpack7z', () => {
  // Scene: the core archives pack their header with LZMA and their files with LZMA2.
  it('gives two files with their names and bytes from an archive with an encoded header', () => {
    expect(unpack7z(archive('encodedHeader'))).toEqual([
      { name: 'alpha.txt', bytes: textBytes(1500), directory: false },
      { name: 'beta/zeros.bin', bytes: new Uint8Array(4000), directory: false },
    ])
  })

  it('gives files from two folders, a directory and an empty file', () => {
    expect(unpack7z(archive('folders'))).toEqual([
      { name: 'one.txt', bytes: textBytes(800, OTHER_PHRASE), directory: false },
      { name: 'folder', bytes: new Uint8Array(0), directory: true },
      { name: 'two.bin', bytes: seededBytes(300), directory: false },
      { name: 'empty.txt', bytes: new Uint8Array(0), directory: false },
    ])
  })

  it('gives nothing from an archive with an empty header', () => {
    expect(unpack7z(headerOnly([0x01, 0x00]))).toEqual([])
  })

  // Scene: every CRC the archive carries holds, or the unpacker says which one fails.
  it('names the file whose CRC fails', () => {
    expect(() => unpack7z(archive('badCrc'))).toThrow(
      'The file two.bin in the 7z archive fails its CRC.',
    )
  })

  it('refuses an archive whose start header fails its CRC', () => {
    const bytes = archive('folders')
    bytes[12] = (bytes[12] as number) ^ 0x01
    expect(() => unpack7z(bytes)).toThrow("The 7z archive's start header fails its CRC.")
  })

  it('refuses an archive whose header fails its CRC', () => {
    const bytes = archive('folders')
    bytes[bytes.length - 2] = (bytes[bytes.length - 2] as number) ^ 0x01
    expect(() => unpack7z(bytes)).toThrow("The 7z archive's header fails its CRC.")
  })

  // Scene: what the unpacker does not read, it refuses with a sentence that names it.
  it('names the method of a coder other than LZMA2 and LZMA', () => {
    expect(() => unpack7z(archive('deflate'))).toThrow(
      'The 7z archive packs a folder with the method Deflate; this unpacker reads LZMA2 and LZMA alone.',
    )
  })

  it('names a method it has no name for by its id', () => {
    const header = [0x01, ...oneFolder([0x02, 0x7f, 0x7e]), 0x00, 0x00, 0x00]
    expect(() => unpack7z(headerOnly(header))).toThrow(
      'The 7z archive packs a folder with the method of id 7f7e; this unpacker reads LZMA2 and LZMA alone.',
    )
  })

  it('refuses a folder of two coders and names both methods', () => {
    const header = [0x01, 0x04, 0x07, 0x0b, 0x01, 0x00, 0x02, 0x04, 3, 3, 1, 3, 0x01, 0x21]
    expect(() => unpack7z(headerOnly(header))).toThrow(
      'The 7z archive chains 2 coders in one folder (BCJ, LZMA2); this unpacker reads one coder per folder.',
    )
  })

  it('refuses a file that is not a 7z archive', () => {
    expect(() =>
      unpack7z(ascii('PK\u0003\u0004 not a 7z archive at all, but long enough')),
    ).toThrow('The file is not a 7z archive: it does not start with the 7z signature.')
  })

  it('refuses an archive cut before its header', () => {
    const bytes = archive('folders')
    expect(() => unpack7z(bytes.subarray(0, bytes.length - 10))).toThrow(
      'The 7z archive ends before its header.',
    )
  })

  it('refuses folders kept outside the header', () => {
    const header = [0x01, 0x04, 0x07, 0x0b, 0x01, 0x01, 0x00]
    expect(() => unpack7z(headerOnly(header))).toThrow(
      'The 7z header keeps its folders outside itself, which this unpacker does not read.',
    )
  })

  it('refuses additional streams', () => {
    expect(() => unpack7z(headerOnly([0x01, 0x03, 0x00]))).toThrow(
      'The 7z header holds additional streams, which this unpacker does not read.',
    )
  })

  it('refuses anti items', () => {
    const header = [0x01, 0x05, 0x01, 0x0e, 0x01, 0x80, 0x10, 0x01, 0x80, 0x00, 0x00]
    expect(() => unpack7z(headerOnly(header))).toThrow(
      'The 7z archive holds anti items, which this unpacker does not read.',
    )
  })

  it('refuses a header property it does not know', () => {
    expect(() => unpack7z(headerOnly([0x01, 0x05, 0x00, 0x30, 0x00, 0x00, 0x00]))).toThrow(
      'The 7z header holds the property 0x30 where it reads the files.',
    )
  })

  it('refuses a header that ends early', () => {
    expect(() => unpack7z(headerOnly([0x01, 0x04, 0x06]))).toThrow('The 7z header ends early.')
  })
})

describe('unpack7z on archives built in the spec', () => {
  it('cuts a folder into two files and checks the folder CRC', () => {
    const header = textHeader(
      [0x0a, 0x01, ...crcBytes(crc32(textBytes(3000)))],
      [0x08, 0x0d, 0x02, 0x09, 0x87, 0xd0, 0x00],
      filesAB,
    )
    expect(unpack7z(build(TEXT, header))).toEqual([
      { name: 'a', bytes: textBytes(2000), directory: false },
      { name: 'b', bytes: textBytes(3000).slice(2000), directory: false },
    ])
  })

  it('names the folder whose CRC fails', () => {
    const header = textHeader(
      [0x0a, 0x01, 1, 2, 3, 4],
      [0x08, 0x0d, 0x02, 0x09, 0x87, 0xd0, 0x00],
      filesAB,
    )
    expect(() => unpack7z(build(TEXT, header))).toThrow("The 7z archive's folder 0 fails its CRC.")
  })

  it('refuses a packed stream whose CRC fails', () => {
    const header = textHeader([], [], [])
    header.splice(7, 0, 0x0a, 0x01, 1, 2, 3, 4)
    expect(() => unpack7z(build(TEXT, header))).toThrow(
      "The 7z archive's packed stream 0 fails its CRC.",
    )
  })

  it('refuses a stream that no file takes', () => {
    expect(() => unpack7z(build(TEXT, textHeader([], [], [])))).toThrow(
      'The 7z archive holds 1 streams for 0 files with data.',
    )
  })

  it('refuses a file with data and no stream', () => {
    expect(() => unpack7z(headerOnly([0x01, ...filesAB, 0x00]))).toThrow(
      'The 7z header lists more files with data than its folders hold.',
    )
  })

  it('refuses a packed stream past the end of the archive', () => {
    const header = textHeader([], [], [])
    header[3] = 0x83
    header.splice(4, 0, 0xe8)
    expect(() => unpack7z(build(TEXT, header))).toThrow(
      'The 7z archive ends inside a packed stream.',
    )
  })

  it('refuses a folder with no packed stream', () => {
    const header = [0x01, ...oneFolder([0x21, 0x21, 0x01, 0x15]), 0x00, 0x00, 0x00]
    expect(() => unpack7z(headerOnly(header))).toThrow(
      'The 7z header names no packed stream for folder 0.',
    )
  })

  it('refuses an LZMA2 coder with other than one property byte', () => {
    const header = [0x01, ...oneFolder([0x21, 0x21, 0x02, 0x15, 0x00]), 0x00, 0x00, 0x00]
    expect(() => unpack7z(headerOnly(header))).toThrow(
      'The LZMA2 coder holds 2 property bytes; it needs 1.',
    )
  })

  it('refuses a packed header whose CRC fails', () => {
    const bytes = archive('encodedHeader')
    bytes[bytes.length - 3] = (bytes[bytes.length - 3] as number) ^ 0x01
    expect(() => unpack7z(resigned(bytes))).toThrow("The 7z archive's packed header fails its CRC.")
  })

  it('refuses a header packed in no folder', () => {
    expect(() => unpack7z(headerOnly([0x17, 0x00]))).toThrow(
      'The 7z archive packs its header in other than one folder.',
    )
  })

  it('refuses a header that starts with neither header id', () => {
    expect(() => unpack7z(headerOnly([0x05]))).toThrow(
      "The 7z archive's header starts with 0x05, which names no header.",
    )
  })

  it('refuses a major version other than 0', () => {
    const bytes = archive('folders')
    bytes[6] = 1
    expect(() => unpack7z(bytes)).toThrow(
      'The 7z archive has the major version 1; this unpacker reads 0.',
    )
  })

  it('refuses a header offset past what an archive can hold', () => {
    const bytes = archive('folders')
    bytes[18] = 0x20
    expect(() => unpack7z(resigned(bytes))).toThrow(
      'The 7z archive names a header past what it can hold.',
    )
  })
})
