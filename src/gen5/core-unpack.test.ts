import { describe, expect, it } from 'vitest'

import {
  DONE,
  FILE,
  PROGRESS,
  type UnpackMessage,
  unpackCore,
  type UnpackPort,
} from './core-unpack'
import { fromBase64, OTHER_PHRASE, seededBytes, textBytes } from './lzma.fixtures'
import { ARCHIVES, headerOnly } from './seven-zip.fixtures'

const archive = (name: keyof typeof ARCHIVES) => fromBase64(ARCHIVES[name])

/** A port that keeps each message with its transfer list, on a clock that steps 5 ms a call. */
function fakePort() {
  const posted: { message: UnpackMessage; transfer: readonly ArrayBuffer[] }[] = []
  let clock = 100
  const port: UnpackPort = {
    post: (message, transfer) => posted.push({ message, transfer }),
    now: () => (clock += 5),
  }
  return { port, posted, messages: () => posted.map((entry) => entry.message) }
}

// Scene: EmulatorJS's compression.js posts the core's 7z archive to the worker and waits for
// progress (t 4), one message per file (t 2) and done (t 1).
describe('unpackCore', () => {
  it('posts progress and each file with its name and bytes, then done, in EmulatorJS shapes', () => {
    const { port, messages } = fakePort()
    unpackCore(archive('encodedHeader'), port)
    expect(messages()).toEqual([
      { t: PROGRESS, current: 1, total: 2, name: 'alpha.txt' },
      { t: FILE, file: 'alpha.txt', data: textBytes(1500) },
      { t: PROGRESS, current: 2, total: 2, name: 'beta/zeros.bin' },
      { t: FILE, file: 'beta/zeros.bin', data: new Uint8Array(4000) },
      { t: DONE },
    ])
    expect([PROGRESS, FILE, DONE]).toEqual([4, 2, 1])
  })

  it('posts no directory, but an empty file', () => {
    const { port, messages } = fakePort()
    unpackCore(archive('folders'), port)
    const files = messages().flatMap((message) => (message.t === FILE ? [message] : []))
    expect(files).toEqual([
      { t: FILE, file: 'one.txt', data: textBytes(800, OTHER_PHRASE) },
      { t: FILE, file: 'two.bin', data: seededBytes(300) },
      { t: FILE, file: 'empty.txt', data: new Uint8Array(0) },
    ])
  })

  it("hands each file's buffer over once, and only that file's buffer", () => {
    const { port, posted } = fakePort()
    unpackCore(archive('folders'), port)
    const buffers = posted.flatMap((entry) => entry.transfer)
    expect(new Set(buffers).size).toBe(buffers.length)
    for (const { message, transfer } of posted) {
      if (message.t !== FILE) {
        expect(transfer).toEqual([])
        continue
      }
      expect(transfer).toHaveLength(1)
      expect(transfer[0]).toBe(message.data.buffer)
      expect(message.data.buffer.byteLength).toBe(message.data.byteLength)
    }
  })

  it('takes the archive as a Uint8Array, as compression.js posts it, or as a bare buffer', () => {
    const bytes = archive('encodedHeader')
    const offset = new Uint8Array(bytes.length + 3)
    offset.set(bytes, 3)
    for (const input of [bytes, bytes.slice().buffer, offset.subarray(3)]) {
      const { port, messages } = fakePort()
      unpackCore(input, port)
      expect(messages().filter((message) => message.t === FILE)).toHaveLength(2)
    }
  })

  it('reports how many files and bytes it unpacked and how long the archive took', () => {
    const { port } = fakePort()
    expect(unpackCore(archive('encodedHeader'), port)).toEqual({ files: 2, bytes: 5500, ms: 5 })
  })

  it('posts done alone for an archive with no files', () => {
    const { port, messages } = fakePort()
    let report: unknown
    expect(() => (report = unpackCore(headerOnly([]), port))).not.toThrow()
    expect(report).toEqual({ files: 0, bytes: 0, ms: 5 })
    expect(messages()).toEqual([{ t: DONE }])
  })

  // Scene: a broken core must end EmulatorJS's wait, not leave it hanging (compression.js resolves
  // on done alone; with no file in hand EmulatorJS stops with its own error).
  it("posts done and throws the decoder's sentence for a broken archive", () => {
    const { port, messages } = fakePort()
    expect(() => unpackCore(archive('badCrc'), port)).toThrow(
      'The file two.bin in the 7z archive fails its CRC.',
    )
    expect(messages()).toEqual([{ t: DONE }])
  })

  it('posts done and says what it got when the message holds no bytes', () => {
    const { port, messages } = fakePort()
    expect(() => unpackCore('core', port)).toThrow(
      'The unpacker got a string, not the bytes of a 7z archive.',
    )
    expect(messages()).toEqual([{ t: DONE }])
  })
})
