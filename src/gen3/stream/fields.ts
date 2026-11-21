// The byte form of one field of the stream, both ways: numbers little-endian, our enums by their
// format.ts number, texts in the game's charset. Every value out of its range is an error.
import { Gen3Error } from '../errors'
import { decodeText, encodeText, EOS } from '../text/charset'
import { STREAM } from './format'

type Numbers = Readonly<Record<string, number>>

/** A field's kind: a number, a flag, a party slot, one of our enums, or a text of fixed length. */
export type Kind = Scalar | { readonly enum: Numbers } | TextField

type Scalar = 'u8' | 'u16' | 's8' | 'bool' | 'slot'

/** A text field of `text` bytes: the text, then EOS up to the end. */
interface TextField {
  readonly text: number
}

const RANGES = {
  u8: [0, 0xff],
  u16: [0, 0xffff],
  s8: [-0x80, 0x7f],
  slot: [0, STREAM.partySize - 1],
} as const

export function fieldSize(kind: Kind): number {
  if (kind === 'u16') return 2
  return typeof kind === 'object' && 'text' in kind ? kind.text : 1
}

export function fieldBytes(kind: Kind, value: unknown, label: string): number[] {
  if (typeof kind !== 'object') return scalarBytes(kind, value, label)
  return 'text' in kind ? textBytes(kind, value, label) : [enumNumber(kind.enum, value, label)]
}

export function readField(kind: Kind, bytes: Uint8Array, at: number, label: string): unknown {
  if (typeof kind !== 'object') return readScalar(kind, bytes, at, label)
  if ('text' in kind) return readText(bytes.subarray(at, at + kind.text), label)
  return enumKey(kind.enum, bytes[at] as number, label)
}

function scalarBytes(kind: Scalar, value: unknown, label: string): number[] {
  if (kind === 'bool') {
    if (typeof value !== 'boolean') throw new Gen3Error(`${label} is not a flag`)
    return [value ? 1 : 0]
  }
  const [min, max] = RANGES[kind]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Gen3Error(`${label} ${String(value)} is no ${kind}`)
  }
  return kind === 'u16' ? [value & 0xff, value >> 8] : [value & 0xff]
}

function readScalar(kind: Scalar, bytes: Uint8Array, at: number, label: string): unknown {
  const byte = bytes[at] as number
  switch (kind) {
    case 'u8':
      return byte
    case 'u16':
      return byte | ((bytes[at + 1] as number) << 8)
    case 's8':
      return byte < 0x80 ? byte : byte - 0x100
    case 'slot':
      if (byte > RANGES.slot[1]) throw new Gen3Error(`${label} ${String(byte)} is no party slot`)
      return byte
    case 'bool':
      if (byte > 1) throw new Gen3Error(`${label} ${String(byte)} is not a flag`)
      return byte === 1
  }
}

function enumNumber(values: Numbers, value: unknown, label: string): number {
  if (typeof value !== 'string' || !Object.hasOwn(values, value)) {
    throw new Gen3Error(`${label} ${String(value)} is not in its enum`)
  }
  return values[value] as number
}

function enumKey(values: Numbers, number: number, label: string): string {
  const key = Object.keys(values).find((name) => values[name] === number)
  if (key === undefined) throw new Gen3Error(`${label} ${String(number)} is not in its enum`)
  return key
}

function textBytes(kind: TextField, value: unknown, label: string): number[] {
  if (typeof value !== 'string') throw new Gen3Error(`${label} is not a text`)
  const bytes = encodeText(value)
  if (bytes.length >= kind.text) {
    throw new Gen3Error(`${label} "${value}" is over ${String(kind.text - 1)} glyphs`)
  }
  return [...bytes, ...Array<number>(kind.text - bytes.length).fill(EOS)]
}

function readText(bytes: Uint8Array, label: string): string {
  const end = bytes.indexOf(EOS)
  if (end < 0) throw new Gen3Error(`${label} has no EOS`)
  return decodeText(bytes.subarray(0, end))
}
