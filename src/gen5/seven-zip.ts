// 7z archives whose folders hold one LZMA2 or LZMA coder each, as EmulatorJS packs its cores:
// the signature header with its CRC, the header or the packed header, the folders, the files with
// their names and CRCs. It follows 7zFormat.txt (LZMA SDK, public domain) for the container and
// lzma-specification.txt for the coders; src/gen5/lzma2.ts names the sources of LZMA2's layout.
// The code is our own, under the repository's licence. It checks every CRC the archive carries and
// throws on what it does not read, naming it.
import { crc32 } from '../patch/crc32.ts'
import { decodeLzma, hex } from './lzma.ts'
import { decodeLzma2 } from './lzma2.ts'
import {
  type Coder,
  type Folder,
  type Header,
  methodName,
  readHeader,
  readStreamsInfo,
  type StreamsInfo,
  type SubStream,
} from './seven-zip-header.ts'
import { ByteReader } from './seven-zip-reader.ts'

/** One item of the archive: a file with its bytes, or a directory with none. */
export interface SevenZipEntry {
  name: string
  bytes: Uint8Array
  directory: boolean
}

const SIGNATURE = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]
const START_HEADER_END = 32
const HEADER = 0x01
const ENCODED_HEADER = 0x17
/** A header may be packed, and in principle packed again; past this many rounds it is refused. */
const PACKINGS = 4

const LZMA2 = '21'
const LZMA = '030101'

function uint64(view: DataView, at: number): number {
  const high = view.getUint32(at + 4, true)
  if (high >= 0x200000) throw new Error('The 7z archive names a header past what it can hold.')
  return high * 2 ** 32 + view.getUint32(at, true)
}

/** The header the start header points at, with both CRCs checked. */
function nextHeader(archive: Uint8Array): Uint8Array {
  if (archive.length < START_HEADER_END || SIGNATURE.some((byte, i) => archive[i] !== byte)) {
    throw new Error('The file is not a 7z archive: it does not start with the 7z signature.')
  }
  if (archive[6] !== 0) {
    throw new Error(
      `The 7z archive has the major version ${String(archive[6])}; this unpacker reads 0.`,
    )
  }
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  if (crc32(archive.subarray(12, START_HEADER_END)) !== view.getUint32(8, true)) {
    throw new Error("The 7z archive's start header fails its CRC.")
  }
  const from = START_HEADER_END + uint64(view, 12)
  const size = uint64(view, 20)
  if (from + size > archive.length) throw new Error('The 7z archive ends before its header.')
  const header = archive.subarray(from, from + size)
  if (crc32(header) !== view.getUint32(28, true)) {
    throw new Error("The 7z archive's header fails its CRC.")
  }
  return header
}

type Decode = (packed: Uint8Array, size: number) => Uint8Array

function decoderOf(coder: Coder): Decode {
  if (coder.id === LZMA2) {
    if (coder.properties.length !== 1) {
      throw new Error(
        `The LZMA2 coder holds ${String(coder.properties.length)} property bytes; it needs 1.`,
      )
    }
    const property = coder.properties[0] as number
    return (packed, size) => decodeLzma2(packed, property, size)
  }
  if (coder.id === LZMA) return (packed, size) => decodeLzma(packed, coder.properties, size)
  throw new Error(
    `The 7z archive packs a folder with the method ${methodName(coder.id)}; this unpacker reads LZMA2 and LZMA alone.`,
  )
}

/** Each folder's output: folder i unpacks packed stream i, as a folder of one coder reads one. */
function unpackFolders(archive: Uint8Array, info: StreamsInfo): Uint8Array[] {
  let at = START_HEADER_END + info.packPos
  return info.folders.map((folder: Folder, i) => {
    const decode = decoderOf(folder.coder)
    const size = info.packSizes[i]
    if (size === undefined) {
      throw new Error(`The 7z header names no packed stream for folder ${String(i)}.`)
    }
    const packed = archive.subarray(at, at + size)
    at += size
    if (packed.length !== size) throw new Error('The 7z archive ends inside a packed stream.')
    const crc = info.packCrcs[i]
    if (crc !== undefined && crc32(packed) !== crc) {
      throw new Error(`The 7z archive's packed stream ${String(i)} fails its CRC.`)
    }
    return decode(packed, folder.size)
  })
}

/** A folder's output cut into its sub-streams; a folder of one stream keeps its own array. */
function cut(
  output: Uint8Array,
  streams: SubStream[],
): { bytes: Uint8Array; crc: number | undefined }[] {
  let at = 0
  return streams.map((stream) => {
    const bytes = streams.length === 1 ? output : output.slice(at, at + stream.size)
    at += stream.size
    return { bytes, crc: stream.crc }
  })
}

function streamsOf(archive: Uint8Array, info: StreamsInfo) {
  const outputs = unpackFolders(archive, info)
  return outputs.flatMap((output, i) => {
    const folder = info.folders[i] as Folder
    const streams = info.streams[i] as SubStream[]
    if (streams.length !== 1 && folder.crc !== undefined && crc32(output) !== folder.crc) {
      throw new Error(`The 7z archive's folder ${String(i)} fails its CRC.`)
    }
    return cut(output, streams)
  })
}

/** The packed header, unpacked and checked: one folder of one stream, whose CRC sits on the
 * folder or in the sub-streams. */
function encodedHeader(archive: Uint8Array, info: StreamsInfo): Uint8Array {
  if (info.folders.length !== 1) {
    throw new Error('The 7z archive packs its header in other than one folder.')
  }
  const streams = streamsOf(archive, info)
  const stream = streams[0]
  if (stream === undefined || streams.length !== 1) {
    throw new Error('The 7z archive packs its header in other than one stream.')
  }
  if (stream.crc !== undefined && crc32(stream.bytes) !== stream.crc) {
    throw new Error("The 7z archive's packed header fails its CRC.")
  }
  return stream.bytes
}

function entries(archive: Uint8Array, header: Header): SevenZipEntry[] {
  const streams = header.main === undefined ? [] : streamsOf(archive, header.main)
  let next = 0
  const result = header.files.map(({ name, hasStream, directory }) => {
    if (!hasStream) return { name, bytes: new Uint8Array(0), directory }
    const stream = streams[next++]
    if (stream === undefined) {
      throw new Error('The 7z header lists more files with data than its folders hold.')
    }
    if (stream.crc !== undefined && crc32(stream.bytes) !== stream.crc) {
      throw new Error(`The file ${name} in the 7z archive fails its CRC.`)
    }
    return { name, bytes: stream.bytes, directory: false }
  })
  if (next !== streams.length) {
    throw new Error(
      `The 7z archive holds ${String(streams.length)} streams for ${String(next)} files with data.`,
    )
  }
  return result
}

/** The files and directories of a 7z archive, in the archive's order. */
export function unpack7z(archive: Uint8Array): SevenZipEntry[] {
  let header = nextHeader(archive)
  // 7-Zip writes an archive with no files as its start header alone, naming a header of size 0.
  if (header.length === 0) return []
  for (let round = 0; round < PACKINGS; round++) {
    const reader = new ByteReader(header)
    const id = reader.byte()
    if (id === HEADER) return entries(archive, readHeader(reader))
    if (id !== ENCODED_HEADER) {
      throw new Error(`The 7z archive's header starts with ${hex(id)}, which names no header.`)
    }
    header = encodedHeader(archive, readStreamsInfo(reader))
  }
  throw new Error(`The 7z archive packs its header more than ${String(PACKINGS - 1)} times.`)
}
