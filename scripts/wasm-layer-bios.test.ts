// The BIOS calls of our platform layer (#43, plan B1), run natively in the host harness. Each
// scene follows GBATEK's "BIOS Memory Copy", "BIOS Decompression Functions", "BIOS Arithmetic
// Functions" and "BIOS Rotation/Scaling Functions".
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildHost, runLayer } from './wasm-layer.ts'
import type { LayerRequest } from './wasm-layer.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-bios-'))
let host = ''
beforeAll(() => {
  host = buildHost(scratch)
}, 60_000)
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const FIXED = 1 << 24
const WORDS = 1 << 26

const call = (command: string, request: LayerRequest) => runLayer(host, command, request)
const halves = (values: readonly number[]) => new Uint8Array(Uint16Array.from(values).buffer)
const words = (values: readonly number[]) => new Uint8Array(Uint32Array.from(values).buffer)
const readHalves = (bytes: Uint8Array) => Array.from(new Uint16Array(bytes.slice().buffer))
const readWords = (bytes: Uint8Array) => Array.from(new Uint32Array(bytes.slice().buffer))
const readSigned = (bytes: Uint8Array) => Array.from(new Int16Array(bytes.slice().buffer))
const filled = (bytes: number, value = 0xee) => new Uint8Array(bytes).fill(value)

describe('CpuSet', () => {
  it('copies as many halfwords as the count names and stops there', () => {
    const { dest } = call('cpuset', {
      args: [5],
      src: halves([1, 2, 3, 4, 5, 6, 7, 8]),
      dest: filled(16),
    })
    expect(readHalves(dest)).toEqual([1, 2, 3, 4, 5, 0xeeee, 0xeeee, 0xeeee])
  })

  it('fills words from one source word', () => {
    const { dest } = call('cpuset', {
      args: [3 | FIXED | WORDS],
      src: words([0xdeadbeef]),
      dest: new Uint8Array(16),
    })
    expect(readWords(dest)).toEqual([0xdeadbeef, 0xdeadbeef, 0xdeadbeef, 0])
  })

  it('reads the count from bits 0-20 only', () => {
    const { dest } = call('cpuset', {
      args: [(1 << 21) | (1 << 22) | (1 << 23) | 2],
      src: halves([9, 8, 7]),
      dest: new Uint8Array(6),
    })
    expect(readHalves(dest)).toEqual([9, 8, 0])
  })
})

describe('CpuFastSet', () => {
  const sixteen = Array.from({ length: 16 }, (_, i) => i + 1)

  it('rounds the word count up to a multiple of 8', () => {
    const { dest } = call('cpufastset', { args: [9], src: words(sixteen), dest: filled(80) })
    expect(readWords(dest)).toEqual([...sixteen, 0xeeeeeeee, 0xeeeeeeee, 0xeeeeeeee, 0xeeeeeeee])
  })

  it('fills from one source word', () => {
    const { dest } = call('cpufastset', {
      args: [8 | FIXED],
      src: words([0x01020304]),
      dest: new Uint8Array(40),
    })
    expect(readWords(dest)).toEqual([...Array<number>(8).fill(0x01020304), 0, 0])
  })
})

/** An LZ77 stream: its header (type 1, the size), then the flag bytes and blocks as given. */
const lz77 = (size: number, body: readonly number[]) =>
  Uint8Array.from([0x10, size & 0xff, (size >> 8) & 0xff, size >> 16, ...body])
/** A compressed block: copy `length` bytes from `disp` + 1 bytes back. */
const block = (length: number, disp: number) => [((length - 3) << 4) | (disp >> 8), disp & 0xff]
const A = 0x41

describe('LZ77UnCompWram', () => {
  it('copies a literal and then a block from one byte back', () => {
    const { dest } = call('lz77w', {
      src: lz77(4, [0b01000000, A, ...block(3, 0)]),
      dest: filled(6),
    })
    expect(Array.from(dest)).toEqual([A, A, A, A, 0xee, 0xee])
  })

  it('copies a block that overlaps what it writes', () => {
    const src = lz77(8, [0b00100000, A, 0x42, ...block(6, 1)])
    const { dest } = call('lz77w', { src, dest: filled(8) })
    expect(String.fromCharCode(...dest)).toBe('ABABABAB')
  })

  it('stops at the size inside a flag byte and inside a block, and writes nothing past it', () => {
    const three = call('lz77w', { src: lz77(3, [0, 0x78, 0x79, 0x7a, 0x7b]), dest: filled(6) })
    expect(Array.from(three.dest)).toEqual([0x78, 0x79, 0x7a, 0xee, 0xee, 0xee])
    const five = call('lz77w', { src: lz77(5, [0b01000000, A, ...block(18, 0)]), dest: filled(8) })
    expect(Array.from(five.dest)).toEqual([A, A, A, A, A, 0xee, 0xee, 0xee])
  })
})

describe('LZ77UnCompVram', () => {
  // 0x1010 literal bytes, then blocks reaching back 2, 3, 0x800 and 0x1000 bytes.
  const literals = Array.from({ length: 0x1010 }, (_, i) => (i * 37 + (i >> 8)) & 0xff)
  const flagged = literals.flatMap((byte, i) => (i % 8 === 0 ? [0, byte] : [byte]))
  const blocks = [
    0b11110000,
    ...block(5, 1),
    ...block(18, 2),
    ...block(7, 0x7ff),
    ...block(3, 0xfff),
  ]
  const size = literals.length + 5 + 18 + 7 + 3

  it('gives the bytes of the Wram call for disp 1-0xFFF', () => {
    const src = lz77(size, [...flagged, ...blocks])
    const wram = call('lz77w', { src, dest: filled(size + 2) })
    const vram = call('lz77v', { src, dest: filled(size + 2) })
    expect(Array.from(vram.dest)).toEqual(Array.from(wram.dest))
    expect(Array.from(wram.dest.subarray(0, 4))).toEqual(literals.slice(0, 4))
    expect(wram.dest[size]).toBe(0xee)
  })

  it('writes in halfwords, so disp 0 reads what the destination held, as GBATEK warns', () => {
    const { dest } = call('lz77v', {
      src: lz77(4, [0b01000000, A, ...block(3, 0)]),
      dest: filled(6),
    })
    expect(Array.from(dest)).toEqual([A, 0xee, 0xee, 0xee, 0xee, 0xee])
  })

  it('keeps the byte after an odd size', () => {
    const { dest } = call('lz77v', { src: lz77(3, [0, 1, 2, 3]), dest: filled(4) })
    expect(Array.from(dest)).toEqual([1, 2, 3, 0xee])
  })
})

describe('Sqrt', () => {
  it.each([
    [0, 0],
    [1, 1],
    [3, 1],
    [4, 2],
    [2 << 30, 46340],
    [0xffffffff, 65535],
  ])('of %i is %i', (num, root) => {
    expect(call('sqrt', { args: [num] }).result).toBe(root)
  })
})

describe('ArcTan2', () => {
  it.each([
    ['the positive x axis', 0x4000, 0, 0],
    ['the positive y axis', 0, 0x4000, 0x4000],
    ['the negative x axis', -0x4000, 0, 0x8000],
    ['the negative y axis', 0, -0x4000, 0xc000],
    ['45 degrees', 0x2000, 0x2000, 0x2000],
  ])('gives the angle of %s', (_, x, y, angle) => {
    expect(call('arctan2', { args: [x & 0xffff, y & 0xffff] }).result).toBe(angle)
  })
})

describe('the sine table', () => {
  it('holds a quarter wave in 65 steps of a 256-step circle, 1.0 as 0x4000', () => {
    const { dest } = call('sine', { dest: new Uint8Array(65 * 2) })
    const expected = Array.from({ length: 65 }, (_, i) =>
      Math.round(Math.sin((i * Math.PI) / 128) * 16384),
    )
    expect(readSigned(dest)).toEqual(expected)
  })
})

/** struct ObjAffineSrcData: s16 xScale, s16 yScale, u16 rotation. */
const objSource = (xScale: number, yScale: number, rotation: number) =>
  halves([xScale & 0xffff, yScale & 0xffff, rotation])

describe('ObjAffineSet', () => {
  const matrix = (src: Uint8Array) =>
    readSigned(call('objaffine', { args: [1, 2], src, dest: new Uint8Array(8) }).dest)

  it('gives the identity at scale 0x100 and angle 0', () => {
    expect(matrix(objSource(0x100, 0x100, 0))).toEqual([0x100, 0, 0, 0x100])
  })

  it("turns a quarter at angle 0x4000 and ignores the angle's lower 8 bits", () => {
    expect(matrix(objSource(0x100, 0x100, 0x4000))).toEqual([0, -0x100, 0x100, 0])
    expect(matrix(objSource(0x100, 0x100, 0x40ff))).toEqual([0, -0x100, 0x100, 0])
  })

  it('scales each row by its own ratio, a negative x ratio flipping the first', () => {
    expect(matrix(objSource(0x200, 0x80, 0))).toEqual([0x200, 0, 0, 0x80])
    expect(matrix(objSource(-0x100, 0x100, 0))).toEqual([-0x100, 0, 0, 0x100])
  })

  it('writes the four values every offset bytes, as into OAM at offset 8', () => {
    const src = new Uint8Array([...objSource(0x100, 0x100, 0), ...objSource(0x200, 0x200, 0)])
    const { dest } = call('objaffine', { args: [2, 8], src, dest: filled(64) })
    const values = readSigned(dest)
    expect(values.filter((_, i) => i % 4 === 0)).toEqual([0x100, 0, 0, 0x100, 0x200, 0, 0, 0x200])
    expect(values.filter((_, i) => i % 4 !== 0).every((value) => value === -0x1112)).toBe(true)
  })
})

/** struct BgAffineSrcData: s32 texX, texY; s16 scrX, scrY, sx, sy; u16 alpha; two bytes padding. */
function bgSource(tex: [number, number], scr: [number, number], scale: number, alpha: number) {
  const view = new DataView(new ArrayBuffer(20))
  view.setInt32(0, tex[0], true)
  view.setInt32(4, tex[1], true)
  view.setInt16(8, scr[0], true)
  view.setInt16(10, scr[1], true)
  view.setInt16(12, scale, true)
  view.setInt16(14, scale, true)
  view.setUint16(16, alpha, true)
  return new Uint8Array(view.buffer)
}

function bgAffine(src: Uint8Array) {
  const view = new DataView(
    call('bgaffine', { args: [1], src, dest: new Uint8Array(16) }).dest.buffer,
  )
  const matrix = [0, 2, 4, 6].map((at) => view.getInt16(at, true))
  return { matrix, start: [view.getInt32(8, true), view.getInt32(12, true)] }
}

describe('BgAffineSet', () => {
  it('puts the texture centre on the screen centre at the identity', () => {
    expect(bgAffine(bgSource([0x1000, 0x800], [8, 4], 0x100, 0))).toEqual({
      matrix: [0x100, 0, 0, 0x100],
      start: [0x1000 - 0x100 * 8, 0x800 - 0x100 * 4],
    })
  })

  it('starts at the texture centre less the matrix times the screen centre', () => {
    expect(bgAffine(bgSource([0x1000, 0x800], [8, 4], 0x100, 0x4000))).toEqual({
      matrix: [0, -0x100, 0x100, 0],
      start: [0x1000 + 0x100 * 4, 0x800 - 0x100 * 8],
    })
  })
})
