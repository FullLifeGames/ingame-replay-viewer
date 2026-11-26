// The files info of a 7z header, after 7zFormat.txt (LZMA SDK, public domain): the names, which
// files have no stream, which of those are empty files rather than directories. It passes over
// the times and attributes and refuses what changes a file's bytes in a way it does not read. The
// code is our own, under the repository's licence.
import { ByteReader, END, refuse } from './seven-zip-reader.ts'

const EMPTY_STREAM = 0x0e
const EMPTY_FILE = 0x0f
const ANTI = 0x10
const NAME = 0x11

/** File properties the unpacker passes over: the three times, the attributes, a comment, the
 * start position and padding. They change no file's bytes. */
const PASSED_OVER = new Set([0x12, 0x13, 0x14, 0x15, 0x16, 0x18, 0x19])

export interface FileItem {
  name: string
  hasStream: boolean
  directory: boolean
}

/** What the files info's properties set, before they become files. */
interface FileFlags {
  emptyStream: boolean[]
  emptyFile: boolean[]
  names: string[]
}

function fileProperty(type: number, body: ByteReader, size: number, flags: FileFlags): void {
  if (type === EMPTY_STREAM) flags.emptyStream = body.bits(flags.emptyStream.length)
  else if (type === EMPTY_FILE) {
    flags.emptyFile = body.bits(flags.emptyStream.filter(Boolean).length)
  } else if (type === NAME) {
    if (body.byte() !== 0) throw new Error('The 7z header keeps its names outside itself.')
    flags.names = new TextDecoder('utf-16le')
      .decode(body.take(size - 1))
      .split('\0')
      .slice(0, -1)
  } else if (type === ANTI) {
    throw new Error('The 7z archive holds anti items, which this unpacker does not read.')
  } else if (!PASSED_OVER.has(type)) refuse(type, 'the files')
}

/** Each file takes two bytes at least: this reader wants a name for each, and a name ends in a
 * two-byte zero. */
const FILE_BITS = 16

export function readFiles(reader: ByteReader): FileItem[] {
  const count = reader.count('files', FILE_BITS)
  const flags: FileFlags = {
    emptyStream: new Array<boolean>(count).fill(false),
    emptyFile: [],
    names: [],
  }
  for (let type = reader.byte(); type !== END; type = reader.byte()) {
    const size = reader.number()
    fileProperty(type, new ByteReader(reader.take(size)), size, flags)
  }
  if (flags.names.length !== count) {
    throw new Error(
      `The 7z header names ${String(flags.names.length)} of its ${String(count)} files.`,
    )
  }
  let empty = 0
  return flags.names.map((name, i) => {
    const hasStream = !flags.emptyStream[i]
    const directory = !hasStream && !flags.emptyFile[empty++]
    return { name, hasStream, directory }
  })
}
