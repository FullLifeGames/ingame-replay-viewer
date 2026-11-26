// The 7z header, after 7zFormat.txt (LZMA SDK, public domain): the streams info (packed streams,
// folders, sub-streams), with the files info from src/gen5/seven-zip-files.ts. It reads what the
// core archives use and refuses the rest with a sentence that names it, and it refuses a count or
// a size before it builds anything that large. The code is our own, under the repository's
// licence.
import { hex } from './lzma.ts'
import { type FileItem, readFiles } from './seven-zip-files.ts'
import { type ByteReader, END, expectEnd, refuse } from './seven-zip-reader.ts'

const ARCHIVE_PROPERTIES = 0x02
const ADDITIONAL_STREAMS = 0x03
const MAIN_STREAMS = 0x04
const FILES_INFO = 0x05
const PACK_INFO = 0x06
const UNPACK_INFO = 0x07
const SUB_STREAMS_INFO = 0x08
const SIZE = 0x09
const CRC = 0x0a
const FOLDER = 0x0b
const CODERS_UNPACK_SIZE = 0x0c
const NUM_UNPACK_STREAM = 0x0d

/** The bytes the folders of one streams info may unpack to, together. The page's largest core,
 * the thread build, unpacks to 6,070,528 bytes in two folders; 64 MiB leaves room for a larger
 * core and still keeps a header of a few bytes from making the worker allocate gigabytes. */
const UNPACKED_LIMIT = 64 * 2 ** 20

/** Each counted item takes a byte at least: a coder its flags, a folder its count of coders, a
 * packed stream its size. A packed stream without a size names no folder's data, so this reader
 * could not unpack one anyway. */
const ITEM_BITS = 8

/** A coder's top flag bit: more alternative methods follow. 7zFormat.txt: "Not used anymore,
 * must be 0". */
const ALTERNATIVE_METHODS = 0x80

/** A coder's method id in hex, and its properties. */
export interface Coder {
  id: string
  properties: Uint8Array
}

/** A folder: one coder, the size it unpacks to and that output's CRC where the header gives it. */
export interface Folder {
  coder: Coder
  size: number
  crc: number | undefined
}

/** A file's stretch of a folder's output. */
export interface SubStream {
  size: number
  crc: number | undefined
}

export interface StreamsInfo {
  /** Where the first packed stream starts, after the signature header. */
  packPos: number
  packSizes: number[]
  packCrcs: (number | undefined)[]
  folders: Folder[]
  /** Each folder's sub-streams, in the folders' order. */
  streams: SubStream[][]
}

export interface Header {
  main: StreamsInfo | undefined
  files: FileItem[]
}

/** The names of methods 7-Zip lists, for a sentence that refuses one. */
const METHODS: Readonly<Record<string, string>> = {
  '00': 'Copy',
  '03': 'Delta',
  '21': 'LZMA2',
  '030101': 'LZMA',
  '03030103': 'BCJ',
  '0303011b': 'BCJ2',
  '030401': 'PPMD',
  '040108': 'Deflate',
  '040109': 'Deflate64',
  '040202': 'BZip2',
  '06f10701': 'AES',
}

/** The method's name, or its id where it has none here. */
export function methodName(id: string): string {
  return METHODS[id] ?? `of id ${id}`
}

function readCoder(reader: ByteReader): Coder {
  const flags = reader.byte()
  const id = Array.from(reader.take(flags & 0x0f), (byte) => hex(byte).slice(2)).join('')
  if (flags & ALTERNATIVE_METHODS) {
    throw new Error(
      `The 7z archive holds a coder ${methodName(id)} with the flag for alternative methods, which the format no longer uses.`,
    )
  }
  if (flags & 0x10) {
    const inputs = reader.number()
    const outputs = reader.number()
    if (inputs !== 1 || outputs !== 1) {
      throw new Error(
        `The 7z archive holds a coder ${methodName(id)} with ${String(inputs)} inputs and ${String(outputs)} outputs; this unpacker reads coders of one each.`,
      )
    }
  }
  const properties = flags & 0x20 ? reader.take(reader.number()) : new Uint8Array(0)
  return { id, properties }
}

function readFolder(reader: ByteReader): Coder {
  const coders = Array.from({ length: reader.count('coders', ITEM_BITS) }, () => readCoder(reader))
  if (coders.length !== 1) {
    const names = coders.map((coder) => methodName(coder.id)).join(', ')
    throw new Error(
      `The 7z archive chains ${String(coders.length)} coders in one folder (${names}); this unpacker reads one coder per folder.`,
    )
  }
  return coders[0] as Coder
}

function readFolders(reader: ByteReader): Folder[] {
  const id = reader.byte()
  if (id !== FOLDER) refuse(id, 'the folders')
  const count = reader.count('folders', ITEM_BITS)
  if (reader.byte() !== 0) {
    throw new Error(
      'The 7z header keeps its folders outside itself, which this unpacker does not read.',
    )
  }
  const coders = Array.from({ length: count }, () => readFolder(reader))
  const sizesId = reader.byte()
  if (sizesId !== CODERS_UNPACK_SIZE) refuse(sizesId, 'the folders')
  const sizes = coders.map(() => reader.number())
  const total = sizes.reduce((sum, size) => sum + size, 0)
  if (total > UNPACKED_LIMIT) {
    throw new Error(
      `The 7z header's folders unpack to ${String(total)} bytes, more than the ${String(UNPACKED_LIMIT)} this unpacker allows.`,
    )
  }
  let next = reader.byte()
  let crcs: (number | undefined)[] = []
  if (next === CRC) {
    crcs = reader.digests(count)
    next = reader.byte()
  }
  expectEnd(next, 'the folders')
  return coders.map((coder, i) => ({ coder, size: sizes[i] as number, crc: crcs[i] }))
}

function readPackInfo(reader: ByteReader, info: StreamsInfo): void {
  info.packPos = reader.number()
  const count = reader.count('packed streams', ITEM_BITS)
  let id = reader.byte()
  if (id === SIZE) {
    info.packSizes = Array.from({ length: count }, () => reader.number())
    id = reader.byte()
  }
  if (id === CRC) {
    info.packCrcs = reader.digests(count)
    id = reader.byte()
  }
  expectEnd(id, 'the packed streams')
}

/** The `count` sub-streams of `folder`: the sizes of all but the last, which takes the rest. */
function folderStreams(reader: ByteReader, folder: Folder, count: number, sized: boolean) {
  if (count === 1) return [{ size: folder.size, crc: folder.crc }]
  if (count > 1 && !sized) throw new Error('The 7z header splits a folder without its sizes.')
  const streams: SubStream[] = []
  let rest = folder.size
  for (let i = 0; i < count; i++) {
    const size = i < count - 1 ? reader.number() : rest
    if (size > rest) throw new Error("The 7z header's sub-streams outgrow their folder.")
    rest -= size
    streams.push({ size, crc: undefined })
  }
  return streams
}

function readSubStreams(reader: ByteReader, folders: Folder[]): SubStream[][] {
  let counts = folders.map(() => 1)
  let id = reader.byte()
  if (id === NUM_UNPACK_STREAM) {
    counts = folders.map(() => reader.number())
    id = reader.byte()
  }
  const sized = id === SIZE
  const streams = folders.map((folder, i) =>
    folderStreams(reader, folder, counts[i] as number, sized),
  )
  if (sized) id = reader.byte()
  if (id === CRC) {
    const open = streams.flatMap((list, i) =>
      list.length === 1 && (folders[i] as Folder).crc !== undefined ? [] : list,
    )
    reader.digests(open.length).forEach((crc, i) => ((open[i] as SubStream).crc = crc))
    id = reader.byte()
  }
  expectEnd(id, 'the sub-streams')
  return streams
}

/** The streams info, from the byte after its own id. */
export function readStreamsInfo(reader: ByteReader): StreamsInfo {
  const info: StreamsInfo = { packPos: 0, packSizes: [], packCrcs: [], folders: [], streams: [] }
  let id = reader.byte()
  if (id === PACK_INFO) {
    readPackInfo(reader, info)
    id = reader.byte()
  }
  if (id === UNPACK_INFO) {
    info.folders = readFolders(reader)
    info.streams = info.folders.map((folder) => [{ size: folder.size, crc: folder.crc }])
    id = reader.byte()
  }
  if (id === SUB_STREAMS_INFO) {
    info.streams = readSubStreams(reader, info.folders)
    id = reader.byte()
  }
  expectEnd(id, 'the streams')
  return info
}

/** The header, from the byte after its own id. */
export function readHeader(reader: ByteReader): Header {
  let id = reader.byte()
  if (id === ARCHIVE_PROPERTIES) {
    for (let type = reader.byte(); type !== END; type = reader.byte()) reader.take(reader.number())
    id = reader.byte()
  }
  if (id === ADDITIONAL_STREAMS) {
    throw new Error('The 7z header holds additional streams, which this unpacker does not read.')
  }
  let main: StreamsInfo | undefined
  if (id === MAIN_STREAMS) {
    main = readStreamsInfo(reader)
    id = reader.byte()
  }
  let files: FileItem[] = []
  if (id === FILES_INFO) {
    files = readFiles(reader)
    id = reader.byte()
  }
  expectEnd(id, 'the header')
  return { main, files }
}
