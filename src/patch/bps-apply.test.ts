import { describe, expect, it } from 'vitest'

import { applyBps } from './bps-apply.ts'
import { BpsError, ByteWriter } from './bps-format.ts'
import { crc32 } from './crc32.ts'

const ascii = (text: string) => new TextEncoder().encode(text)

const SOURCE = ascii('ABCDEFGH')
const TARGET = ascii('ABCDxyEFGHGHGH')

// The commands of the hand-made patch, byte by byte from the spec.
const HAND_COMMANDS = [
  0x8c, // SourceRead, length 4: ((4 - 1) << 2) | 0 = 12
  0x85,
  0x78,
  0x79, // TargetRead, length 2: ((2 - 1) << 2) | 1 = 5, then "xy"
  0x8e,
  0x88, // SourceCopy, length 4: 14; offset +4 from 0: (4 << 1) | 0 = 8
  0x8f,
  0x90, // TargetCopy, length 4: 15; offset +8 from 0: (8 << 1) | 0 = 16; copies "GH" twice
]

interface Sealed {
  sourceSize?: number
  targetSize: number
  commands: number[]
  metadata?: number[]
  source?: Uint8Array
  targetCrc?: number
}

// Header, commands and footer with a valid patch checksum, so each later check is reached.
function seal(parts: Sealed): Uint8Array {
  const source = parts.source ?? SOURCE
  const writer = new ByteWriter()
  writer.pushBytes(ascii('BPS1'))
  writer.pushNumber(parts.sourceSize ?? source.length)
  writer.pushNumber(parts.targetSize)
  writer.pushNumber(parts.metadata?.length ?? 0)
  writer.pushBytes(new Uint8Array(parts.metadata ?? []))
  writer.pushBytes(new Uint8Array(parts.commands))
  writer.pushUint32(crc32(source))
  writer.pushUint32(parts.targetCrc ?? 0)
  writer.pushUint32(crc32(writer.finish()))
  return writer.finish()
}

const handPatch = () =>
  seal({ targetSize: TARGET.length, commands: HAND_COMMANDS, targetCrc: crc32(TARGET) })

describe('applyBps', () => {
  it('applies a patch built by hand from the spec', () => {
    expect(applyBps(handPatch(), SOURCE)).toEqual(TARGET)
  })

  it('skips the metadata', () => {
    const patch = seal({
      targetSize: TARGET.length,
      commands: HAND_COMMANDS,
      metadata: [0x3c, 0x3e, 0x00],
      targetCrc: crc32(TARGET),
    })
    expect(applyBps(patch, SOURCE)).toEqual(TARGET)
  })

  it('names a wrong source by its checksum', () => {
    expect(() => applyBps(handPatch(), ascii('ABCDEFGX'))).toThrow(
      /wrong source: its checksum differs/,
    )
  })

  it('names a wrong source by its size', () => {
    expect(() => applyBps(handPatch(), ascii('ABCDEFG'))).toThrow(
      /wrong source: it has 7 bytes, the patch expects 8/,
    )
  })

  it('calls a patch with a changed byte corrupt', () => {
    const patch = handPatch()
    patch[10] = 0x7a
    expect(() => applyBps(patch, SOURCE)).toThrow(BpsError)
    expect(() => applyBps(patch, SOURCE)).toThrow(/corrupt patch/)
  })

  it.each([1, 4, 13])('calls a patch missing its last %i bytes truncated', (cut) => {
    const patch = handPatch().subarray(0, handPatch().length - cut)
    expect(() => applyBps(patch, SOURCE)).toThrow(/truncated patch/)
  })

  it('calls a patch shorter than header and footer truncated', () => {
    expect(() => applyBps(ascii('BPS1'), SOURCE)).toThrow(/truncated patch/)
  })

  it('refuses a file without the BPS1 magic', () => {
    const patch = handPatch()
    patch[3] = 0x32
    expect(() => applyBps(patch, SOURCE)).toThrow(/not a BPS1 patch/)
  })

  it('refuses a target that differs from its checksum', () => {
    const patch = seal({ targetSize: TARGET.length, commands: HAND_COMMANDS, targetCrc: 1 })
    expect(() => applyBps(patch, SOURCE)).toThrow(/target checksum differs/)
  })
})

describe('applyBps bounds', () => {
  const refuse = (parts: Sealed, message: RegExp) => {
    expect(() => applyBps(seal(parts), parts.source ?? SOURCE)).toThrow(message)
  }

  it('refuses a SourceRead past the end of the source', () => {
    refuse({ targetSize: 9, commands: [0xa0] }, /SourceRead reads past the end of the source/)
  })

  it('refuses a SourceCopy before the start of the source', () => {
    refuse({ targetSize: 1, commands: [0x82, 0x83] }, /SourceCopy reads outside the source/)
  })

  it('refuses a SourceCopy past the end of the source', () => {
    refuse({ targetSize: 4, commands: [0x8e, 0x8c] }, /SourceCopy reads outside the source/)
  })

  it('refuses a TargetCopy of bytes not yet written', () => {
    refuse({ targetSize: 1, commands: [0x83, 0x80] }, /TargetCopy reads target bytes not yet/)
  })

  it('refuses a TargetCopy before the start of the target', () => {
    refuse({ targetSize: 2, commands: [0x81, 0x41, 0x83, 0x83] }, /TargetCopy reads target bytes/)
  })

  it('refuses a command that writes past the target size', () => {
    refuse({ targetSize: 2, commands: [0x89, 1, 2, 3] }, /writes past the target size of 2/)
  })

  it('refuses commands that end before the target is complete', () => {
    refuse({ targetSize: 3, commands: [0x85, 1, 2] }, /commands end after 2 of 3 target bytes/)
  })

  it('refuses a TargetRead that runs past the commands', () => {
    refuse({ targetSize: 3, commands: [0x89, 1] }, /TargetRead runs past the end/)
  })
})
