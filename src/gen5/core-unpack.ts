// The Gen 5 page's unpacker of the emulator's core (#79), in place of EmulatorJS's
// data/compression/extract7z.js. EmulatorJS's compression.js fetches the script that
// window.EJS_paths names for extract7z.js, starts it as a classic worker, posts it the core's 7z
// archive and waits for three kinds of message: progress (t 4), a file (t 2) and done (t 1). It
// resolves on done alone, so every way out posts done. This module holds the worker's logic on
// unpack7z (src/gen5/seven-zip.ts); src/gen5/unpacker.ts names the script, and the worker's own
// shell is src/web/gen5/extract7z.ts.
import { type SevenZipEntry, unpack7z } from './seven-zip.ts'

/** The message kinds of compression.js. */
export const PROGRESS = 4
export const FILE = 2
export const DONE = 1

export type UnpackMessage =
  | { t: typeof PROGRESS; current: number; total: number; name: string }
  | { t: typeof FILE; file: string; data: Uint8Array<ArrayBuffer> }
  | { t: typeof DONE }

/** The worker's side of the channel: posting with a transfer list, and a clock in ms. */
export interface UnpackPort {
  post(message: UnpackMessage, transfer: readonly ArrayBuffer[]): void
  now(): number
}

/** What one archive gave: its files, their bytes, and the ms the archive took to unpack. */
export interface UnpackReport {
  files: number
  bytes: number
  ms: number
}

/** The archive's bytes from the message EmulatorJS posts: a Uint8Array, or a bare buffer. */
function bytesOf(data: unknown): Uint8Array {
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  throw new TypeError(`The unpacker got a ${typeof data}, not the bytes of a 7z archive.`)
}

/** `bytes` on a buffer of its own that no earlier message handed over; a copy where it shares one. */
function ownBytes(bytes: Uint8Array, sent: Set<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  const { buffer } = bytes
  const whole = bytes.byteOffset === 0 && bytes.byteLength === buffer.byteLength
  const own =
    whole && buffer instanceof ArrayBuffer && !sent.has(buffer)
      ? new Uint8Array(buffer)
      : bytes.slice()
  sent.add(own.buffer)
  return own
}

/** Unpacks the archive in `data` and posts each file with progress before it, then done; the
 * report is counted before the posts hand the buffers over. On a broken archive it posts done,
 * so EmulatorJS stops with its own error instead of waiting, and throws the decoder's sentence
 * for the console. */
export function unpackCore(data: unknown, port: UnpackPort): UnpackReport {
  const start = port.now()
  let files: SevenZipEntry[]
  try {
    files = unpack7z(bytesOf(data)).filter((entry) => !entry.directory)
  } catch (error) {
    port.post({ t: DONE }, [])
    throw error
  }
  const report = {
    files: files.length,
    bytes: files.reduce((sum, entry) => sum + entry.bytes.byteLength, 0),
    ms: port.now() - start,
  }
  const sent = new Set<ArrayBufferLike>()
  files.forEach((entry, at) => {
    port.post({ t: PROGRESS, current: at + 1, total: files.length, name: entry.name }, [])
    const bytes = ownBytes(entry.bytes, sent)
    port.post({ t: FILE, file: entry.name, data: bytes }, [bytes.buffer])
  })
  port.post({ t: DONE }, [])
  return report
}
