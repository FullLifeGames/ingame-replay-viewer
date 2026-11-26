import { describe, expect, it } from 'vitest'

import type { PkmNumbers } from './bw2-numbers'
import {
  blockPlaces,
  cipherHalfwords,
  halfwordSum,
  openPkm,
  pkmConstant,
  pkmLayout,
  sealPkm,
} from './pkm-cipher'
import { PKM } from './pkm.fixtures'

// Every number here is invented for the spec, as is the whole format of pkm.fixtures.ts: a
// Pokémon of 156 bytes, the checksum at 0, the flag bits at 2, the content buffer at 4 with four
// chunks of 28, the PID at 116, the party part from 120.

const CHECKSUM = 0
const FLAGS = 2
const PID = 116
const CONTENT = 4
const CHUNK = 28
const CONTENT_END = CONTENT + 4 * CHUNK
const PARTY = 120
const SIZE = 156

/** A PID whose selector value is 0 (the logical order), and one whose value is 2. */
const ROW_0 = 0x0000_0123
const ROW_2 = 0x1234_0812

/** Invented plain bytes under `pid`: every byte differs from its neighbours, the checksum is 0. */
function plainUnder(pid: number): Uint8Array {
  const bytes = Uint8Array.from({ length: SIZE }, (_, i) => (i * 7 + 3) % 256)
  const view = new DataView(bytes.buffer)
  view.setUint32(PID, pid, true)
  view.setUint16(FLAGS, 0, true)
  view.setUint16(CHECKSUM, 0, true)
  return bytes
}

const u16 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset).getUint16(offset, true)

/** The key's next output as a reference in BigInt: the 32-bit product, the sum, the shift. */
function referenceRun(bytes: Uint8Array, seed: number, step: PkmNumbers['cipher']): Uint8Array {
  const out = Uint8Array.from(bytes)
  let key = BigInt(seed)
  for (let i = 0; i < out.length; i += 2) {
    key = (key * BigInt(step.multiplier) + BigInt(step.increment)) & 0xffffffffn
    const mask = Number((key >> BigInt(step.shift)) & 0xffffn)
    out[i] = (out[i] ?? 0) ^ (mask & 0xff)
    out[i + 1] = (out[i + 1] ?? 0) ^ (mask >> 8)
  }
  return out
}

// Scene: the game keeps a Pokémon's four blocks in an order its PID picks.
describe('blockPlaces', () => {
  it("puts each block at the offset of the PID's row, so row 2 puts block B first", () => {
    expect(blockPlaces(ROW_2, PKM)).toEqual({
      PkmBlockA: 2 * CHUNK,
      PkmBlockB: 0,
      PkmBlockC: CHUNK,
      PkmBlockD: 3 * CHUNK,
    })
    expect(blockPlaces(ROW_0, PKM)).toEqual({
      PkmBlockA: 0,
      PkmBlockB: CHUNK,
      PkmBlockC: 2 * CHUNK,
      PkmBlockD: 3 * CHUNK,
    })
  })

  it('throws naming the table when the selector gives a row it lacks', () => {
    const short = { ...PKM, blockOffsets: PKM.blockOffsets.slice(0, 2) }
    expect(() => blockPlaces(ROW_2, short)).toThrow(/block table has no row/)
  })

  it('throws naming the block the table gives no column', () => {
    const { PkmBlockD: _d, ...columns } = PKM.blockColumns
    expect(_d).toBe(2)
    expect(() => blockPlaces(ROW_0, { ...PKM, blockColumns: columns })).toThrow(/PkmBlockD/)
  })
})

// Scene: each halfword of a part XORs with the next output of the key's step.
describe('cipherHalfwords', () => {
  it('steps the key before each halfword and XORs the shifted key into it', () => {
    const step = { multiplier: 3, increment: 1, shift: 0 }
    // Seed 1: the key goes to 4, then to 13.
    expect([...cipherHalfwords(new Uint8Array(4), 1, step)]).toEqual([4, 0, 13, 0])
    const shifted = { multiplier: 3, increment: 1, shift: 2 }
    expect([...cipherHalfwords(new Uint8Array(4), 1, shifted)]).toEqual([1, 0, 3, 0])
  })

  it('keeps the low 32 bits of a product that passes 2^53', () => {
    const { cipher } = PKM
    const seed = 0xfedc_ba98
    expect(seed * cipher.multiplier > 2 ** 53).toBe(true)
    const bytes = Uint8Array.from({ length: 12 }, (_, i) => i * 17)
    expect([...cipherHalfwords(bytes, seed, cipher)]).toEqual([
      ...referenceRun(bytes, seed, cipher),
    ])
  })

  it('gives the bytes back when it runs twice, and leaves its input as it was', () => {
    const bytes = Uint8Array.of(9, 8, 7, 6)
    const once = cipherHalfwords(bytes, 0x1357, PKM.cipher)
    expect([...bytes]).toEqual([9, 8, 7, 6])
    expect([...cipherHalfwords(once, 0x1357, PKM.cipher)]).toEqual([9, 8, 7, 6])
  })

  it('throws on a part of an odd length', () => {
    expect(() => cipherHalfwords(new Uint8Array(3), 1, PKM.cipher)).toThrow(/halfwords/)
  })
})

// Scene: the checksum is the sum of the plain content's halfwords in 16 bits.
describe('halfwordSum', () => {
  it('wraps at a halfword when two halfwords overflow', () => {
    expect(halfwordSum(Uint8Array.of(0xff, 0xff, 0x02, 0x00))).toBe(1)
    expect(halfwordSum(Uint8Array.of(0x34, 0x12, 0x01, 0x01))).toBe(0x1335)
  })
})

// Scene: the game seals the box part under the checksum and the party part under the PID.
describe('sealPkm', () => {
  it('places the blocks by the PID, sums, then ciphers each part under its key', () => {
    const plain = plainUnder(ROW_2)
    const sealed = sealPkm(plain, PKM)
    const content = plain.subarray(CONTENT, CONTENT_END)
    const checksum = halfwordSum(content)
    expect(u16(sealed, CHECKSUM)).toBe(checksum)
    expect([...sealed.subarray(FLAGS, CONTENT)]).toEqual([...plain.subarray(FLAGS, CONTENT)])
    expect([...sealed.subarray(PID, PARTY)]).toEqual([...plain.subarray(PID, PARTY)])
    const placed = new Uint8Array(4 * CHUNK)
    // Row 2: B, C, A, D.
    ;[1, 2, 0, 3].forEach((block, i) => {
      placed.set(content.subarray(block * CHUNK, (block + 1) * CHUNK), i * CHUNK)
    })
    expect([...sealed.subarray(CONTENT, CONTENT_END)]).toEqual([
      ...cipherHalfwords(placed, checksum, PKM.cipher),
    ])
    expect([...sealed.subarray(PARTY)]).toEqual([
      ...cipherHalfwords(plain.subarray(PARTY), ROW_2, PKM.cipher),
    ])
  })

  it('keeps the checksum and the box part under two PIDs of one row, and changes the party part', () => {
    const other = 0x5a5a_0123
    const one = sealPkm(plainUnder(ROW_0), PKM)
    const two = sealPkm(plainUnder(other), PKM)
    expect(u16(one, CHECKSUM)).toBe(u16(two, CHECKSUM))
    expect([...one.subarray(CONTENT, CONTENT_END)]).toEqual([...two.subarray(CONTENT, CONTENT_END)])
    expect([...one.subarray(PARTY)]).not.toEqual([...two.subarray(PARTY)])
  })

  it('throws naming PartyPkm on bytes of another size', () => {
    expect(() => sealPkm(new Uint8Array(SIZE - 2), PKM)).toThrow(/PartyPkm/)
    expect(() => openPkm(new Uint8Array(SIZE + 2), PKM)).toThrow(/PartyPkm/)
  })
})

// Scene: opening reverses the seal and says whether the checksum is right.
describe('openPkm', () => {
  it('gives the plain bytes back with the sum in the checksum, and the checksum right', () => {
    const plain = plainUnder(ROW_2)
    const opened = openPkm(sealPkm(plain, PKM), PKM)
    expect(opened.checksumRight).toBe(true)
    new DataView(plain.buffer).setUint16(
      CHECKSUM,
      halfwordSum(plain.subarray(CONTENT, CONTENT_END)),
      true,
    )
    expect([...opened.plain]).toEqual([...plain])
  })

  it('says the checksum is wrong when one byte of the box part flips', () => {
    const sealed = sealPkm(plainUnder(ROW_0), PKM)
    sealed[CONTENT + 5] = (sealed[CONTENT + 5] ?? 0) ^ 0x10
    expect(openPkm(sealed, PKM).checksumRight).toBe(false)
  })

  it('leaves the sealed bytes as they were', () => {
    const sealed = sealPkm(plainUnder(ROW_0), PKM)
    const copy = Uint8Array.from(sealed)
    openPkm(sealed, PKM)
    expect([...sealed]).toEqual([...copy])
  })
})

// Scene: a lookup the generated file cannot answer names what it misses.
describe('the lookups', () => {
  it('throw naming a missing layout or constant', () => {
    expect(() => pkmLayout(PKM, 'PkmBlockE')).toThrow(/no layout PkmBlockE/)
    expect(() => pkmConstant(PKM, 'GENDER_OTHER')).toThrow(/no constant GENDER_OTHER/)
    expect(pkmConstant(PKM, 'PARTY_SIZE')).toBe(3)
  })
})
